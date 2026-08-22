import type { EventSourceRole, SourceRelationType } from "@prisma/client";
import { structuredComplete } from "../ai/client.ts";
import { sourceIndependencePrompt } from "../ai/prompts/source-independence.ts";
import { independenceSchema, jsonSchemas } from "../ai/schemas.ts";
import { loadEnv } from "../config/env.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { pairwiseSimilarity } from "./cluster.ts";
import { isOfficialItem, sourceDisplayName, sourceOrganization, type RawNewsWithSource } from "./grouping.ts";

export type IndependenceResult = {
  independentOrgs: string[];
  officialConfirmation: boolean;
  officialNames: string[];
  primaryUrl: string | null;
  anonymous: boolean;
  contradictions: string[];
  telegramOnly: boolean;
};

export async function analyzeIndependence(eventId: string): Promise<IndependenceResult> {
  const env = loadEnv();
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

  const items = event.sources
    .map((link) => link.rawNews as RawNewsWithSource)
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());

  const copyOf = new Map<string, string>();
  const citationOf = new Map<string, string>();

  for (let i = 0; i < items.length; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const later = items[i];
      const earlier = items[j];
      const similarity = pairwiseSimilarity(
        { id: later.id, title: later.title, content: later.content ?? "", publishedAt: later.publishedAt },
        { id: earlier.id, title: earlier.title, content: earlier.content ?? "", publishedAt: earlier.publishedAt },
      );
      if (similarity >= env.COPY_SIMILARITY_THRESHOLD) {
        copyOf.set(later.id, earlier.id);
        await upsertRelation(later.id, earlier.id, "copy", similarity);
      }
    }
  }

  let anonymous = items.some((item) =>
    /unnamed|anonymous|\u0430\u043d\u043e\u043d\u0456\u043c|\u0434\u0436\u0435\u0440\u0435\u043b\u0430 \u0432 \u0441\u0438\u043b\u043e\u0432\u0438\u0445|\u0441\u043e\u0431\u0435\u0441\u0456\u0434\u043d\u0438\u043a/i.test(
      `${item.title} ${item.content ?? ""}`,
    ),
  );
  let contradictions: string[] = [];

  if (items.length > 1) {
    try {
      const ai = await structuredComplete({
        name: "source_independence",
        model: "fast",
        system: sourceIndependencePrompt.system,
        user: sourceIndependencePrompt.user(
          items.map((item, index) => ({
            index,
            sourceName: sourceDisplayName(item),
            title: item.title,
            content: item.content ?? item.summary ?? "",
            publishedAt: item.publishedAt.toISOString(),
          })),
        ),
        schema: jsonSchemas.source_independence.schema,
        zodSchema: independenceSchema,
      });
      anonymous = anonymous || ai.anonymous_claim;
      contradictions = ai.contradictions;
      for (const pair of ai.pairs) {
        if (pair.later_index === pair.earlier_index) continue;
        const later = items[pair.later_index];
        const earlier = items[pair.earlier_index];
        if (!later || !earlier) continue;
        if (pair.type === "copy") {
          copyOf.set(later.id, earlier.id);
          await upsertRelation(later.id, earlier.id, "copy", 0.8);
        }
        if (pair.type === "citation") {
          citationOf.set(later.id, earlier.id);
          await upsertRelation(later.id, earlier.id, "citation", 0.5);
        }
      }
    } catch (error) {
      logger.warn({ err: error, eventId }, "independence AI failed; using deterministic copies only");
    }
  }

  const derived = new Set([...copyOf.keys(), ...citationOf.keys()]);
  const roots = items.filter((item) => !derived.has(item.id));
  const independentOrgs = [...new Set(roots.map(sourceOrganization))];
  const officialItems = items.filter(isOfficialItem);
  const telegramOnly = items.every((item) => item.sourceType === "telegram" || item.sourceType === "official_telegram")
    && officialItems.length === 0;

  const earliest = items[0];
  const primaryUrl = earliest?.url ?? items.find((item) => item.url)?.url ?? null;

  for (const item of items) {
    let role: EventSourceRole = "independent";
    if (isOfficialItem(item)) role = "official";
    else if (copyOf.has(item.id)) role = "copy";
    else if (citationOf.has(item.id)) role = "citation";
    else if (item.id === earliest?.id) role = "primary";

    await prisma.eventSource.update({
      where: { eventId_rawNewsId: { eventId, rawNewsId: item.id } },
      data: { role },
    });
  }

  if (primaryUrl) {
    await prisma.event.update({
      where: { id: eventId },
      data: { primarySourceUrl: primaryUrl },
    });
  }

  await prisma.aiAnalysis.create({
    data: {
      eventId,
      kind: "independence",
      model: "pipeline",
      promptName: "source_independence",
      input: { rawNewsIds: items.map((item) => item.id) },
      output: { independentOrgs, officialConfirmation: officialItems.length > 0, contradictions, telegramOnly },
    },
  });

  return {
    independentOrgs,
    officialConfirmation: officialItems.length > 0,
    officialNames: officialItems.map(sourceDisplayName),
    primaryUrl,
    anonymous,
    contradictions,
    telegramOnly,
  };
}

async function upsertRelation(
  fromNewsId: string,
  toNewsId: string,
  type: SourceRelationType,
  similarity: number,
): Promise<void> {
  await prisma.sourceRelationship.upsert({
    where: { fromNewsId_toNewsId_type: { fromNewsId, toNewsId, type } },
    update: { similarity },
    create: { fromNewsId, toNewsId, type, similarity },
  });
}
