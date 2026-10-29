import type { VerificationStatus } from "@prisma/client";
import { structuredComplete } from "../ai/client.ts";
import { credibilityPrompt } from "../ai/prompts/credibility.ts";
import { credibilitySchema, jsonSchemas } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { isOfficialItem, sourceDisplayName, sourceOrganization, type RawNewsWithSource } from "./grouping.ts";
import type { IndependenceResult } from "./independence.ts";

export type CredibilityResult = {
  score: number;
  base: number;
  adjustment: number;
  status: VerificationStatus;
  reason: string;
};

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function independentMediaOrgs(items: RawNewsWithSource[], independence: IndependenceResult): string[] {
  const officialOrgs = new Set(items.filter(isOfficialItem).map(sourceOrganization));
  return independence.independentOrgs.filter((org) => !officialOrgs.has(org));
}

export function computeCredibilityBase(
  items: RawNewsWithSource[],
  independence: IndependenceResult,
): number {
  let score = 28;
  const mediaOrgs = independentMediaOrgs(items, independence);

  const reliabilities = mediaOrgs.map((org) => {
    const found = items.find((candidate) => sourceOrganization(candidate) === org);
    return found?.source?.reliabilityScore ?? found?.telegramSource?.reliabilityScore ?? 40;
  });

  const avgReliability =
    reliabilities.length === 0 ? 40 : reliabilities.reduce((sum, value) => sum + value, 0) / reliabilities.length;

  score += Math.min(48, mediaOrgs.length * 16);
  score += Math.round((avgReliability - 50) * 0.35);
  if (
    mediaOrgs.length === 1 &&
    avgReliability >= 80 &&
    !independence.telegramOnly &&
    !independence.anonymous
  ) {
    score += 8;
  }

  if (independence.officialConfirmation) score += 12;
  if (independence.primaryUrl) score += 4;
  if (independence.telegramOnly) score -= 18;
  if (independence.anonymous) score -= 10;
  if (independence.contradictions.length > 0) score -= 25;

  return clamp(score);
}

export function statusFromScore(score: number, contradicted: boolean): VerificationStatus {
  if (contradicted) return "contradicted";
  if (score >= 85) return "confirmed";
  if (score >= 70) return "mostly_confirmed";
  return "unconfirmed";
}

export async function scoreCredibility(eventId: string, independence: IndependenceResult): Promise<CredibilityResult> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      sources: {
        include: {
          rawNews: {
            include: {
              source: { select: { name: true, organization: true, isOfficial: true, reliabilityScore: true } },
              telegramSource: {
                select: {
                  name: true,
                  organization: true,
                  officialSourceId: true,
                  reliabilityScore: true,
                  sourceType: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const items = event.sources.map((link) => link.rawNews as RawNewsWithSource);
  const base = computeCredibilityBase(items, independence);

  let adjustment = 0;
  let reason = defaultReason(independence);
  let aiStatus = statusFromScore(base, independence.contradictions.length > 0);
  let officialFromAi = independence.officialConfirmation;

  try {
    const ai = await structuredComplete({
      name: "credibility",
      model: "fast",
      system: credibilityPrompt.system,
      user: credibilityPrompt.user({
        title: event.title,
        summary: event.normalizedSummary,
        base_score: base,
        official_confirmation_found: independence.officialConfirmation,
        official_names: independence.officialNames,
        independent_organizations: independence.independentOrgs,
        telegram_only: independence.telegramOnly,
        anonymous_claim: independence.anonymous,
        contradictions: independence.contradictions,
        sources: items.map((item) => ({
          name: sourceDisplayName(item),
          type: item.sourceType,
          reliability: item.source?.reliabilityScore ?? item.telegramSource?.reliabilityScore ?? 40,
        })),
      }),
      schema: jsonSchemas.credibility.schema,
      zodSchema: credibilitySchema,
    });
    adjustment = Math.max(-10, Math.min(10, Math.round(ai.adjustment)));
    reason = ai.reason;
    aiStatus = ai.status;
    officialFromAi = independence.officialConfirmation && ai.has_official_confirmation;
    if (!independence.officialConfirmation) {
      officialFromAi = false;
    }
  } catch (error) {
    logger.warn({ err: error, eventId }, "credibility AI failed; using deterministic base");
  }

  const contradicted = independence.contradictions.length > 0 || aiStatus === "contradicted";
  const score = clamp(base + adjustment);
  const status = statusFromScore(score, contradicted);

  await prisma.event.update({
    where: { id: eventId },
    data: { credibilityScore: score, verificationStatus: status },
  });

  await prisma.aiAnalysis.create({
    data: {
      eventId,
      kind: "credibility",
      model: "pipeline",
      promptName: "credibility",
      input: { base, independence, officialFromAi },
      output: { score, adjustment, status, reason },
    },
  });

  return { score, base, adjustment, status, reason };
}

function defaultReason(independence: IndependenceResult): string {
  if (independence.contradictions.length > 0) {
    return "\u0414\u0436\u0435\u0440\u0435\u043b\u0430 \u0441\u0443\u043f\u0435\u0440\u0435\u0447\u0430\u0442\u044c \u043e\u0434\u043d\u0435 \u043e\u0434\u043d\u043e\u043c\u0443.";
  }
  if (independence.officialConfirmation && independence.independentOrgs.length >= 2) {
    return `\u041f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043e ${independence.independentOrgs.slice(0, 3).join(", ")} \u0442\u0430 \u043e\u0444\u0456\u0446\u0456\u0439\u043d\u0438\u043c \u0434\u0436\u0435\u0440\u0435\u043b\u043e\u043c.`;
  }
  if (independence.independentOrgs.length >= 2) {
    return `\u0404 ${independence.independentOrgs.length} \u043d\u0435\u0437\u0430\u043b\u0435\u0436\u043d\u0456 \u0434\u0436\u0435\u0440\u0435\u043b\u0430: ${independence.independentOrgs.slice(0, 3).join(", ")}.`;
  }
  if (independence.telegramOnly) {
    return "\u0406\u043d\u0444\u043e\u0440\u043c\u0430\u0446\u0456\u044f \u043f\u043e\u0448\u0438\u0440\u044e\u0454\u0442\u044c\u0441\u044f \u0432 Telegram, \u0430\u043b\u0435 \u043d\u0435\u0437\u0430\u043b\u0435\u0436\u043d\u043e\u0433\u043e \u043f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043d\u044f \u043f\u043e\u043a\u0438 \u043d\u0435\u043c\u0430\u0454.";
  }
  return "\u041d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043d\u044c\u043e \u043d\u0435\u0437\u0430\u043b\u0435\u0436\u043d\u0438\u0445 \u043f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u044c.";
}
