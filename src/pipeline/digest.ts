import { structuredComplete } from "../ai/client.ts";
import { summaryPrompt } from "../ai/prompts/summary.ts";
import { jsonSchemas, summarySchema } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { clampText } from "../normalize/text.ts";
import { type RawNewsWithSource } from "./grouping.ts";
import { loadEnv } from "../config/env.ts";
import { isOfficialNoise, isVagueCopy, tooSimilar, uniqueSources } from "./quality.ts";
import type { EventForSelection } from "./selection.ts";

const CIRCLED = [
  "1\uFE0F\u20E3",
  "2\uFE0F\u20E3",
  "3\uFE0F\u20E3",
  "4\uFE0F\u20E3",
  "5\uFE0F\u20E3",
  "6\uFE0F\u20E3",
  "7\uFE0F\u20E3",
  "8\uFE0F\u20E3",
  "9\uFE0F\u20E3",
  "\u{1F51F}",
];

const LABEL_CREDIBILITY = "\u0414\u043e\u0441\u0442\u043e\u0432\u0456\u0440\u043d\u0456\u0441\u0442\u044c";
const LABEL_IMPORTANCE = "\u0412\u0430\u0436\u043b\u0438\u0432\u0456\u0441\u0442\u044c";
const LABEL_SOURCES = "\u0414\u0436\u0435\u0440\u0435\u043b\u0430";
const TITLE_DAY = "\u0417\u0410 \u0414\u041e\u0411\u0423";
const FOOTER_UK =
  "\u041d\u043e\u0432\u0438\u043d\u0438 \u0430\u0432\u0442\u043e\u043c\u0430\u0442\u0438\u0447\u043d\u043e \u0437\u0456\u0431\u0440\u0430\u043d\u0456 \u0442\u0430 \u043f\u0435\u0440\u0435\u0432\u0456\u0440\u0435\u043d\u0456 \u043d\u0430 \u043e\u0441\u043d\u043e\u0432\u0456 \u043a\u0456\u043b\u044c\u043a\u043e\u0445 \u0434\u0436\u0435\u0440\u0435\u043b.";

export type WrittenItem = {
  eventId: string;
  rank: number;
  headline: string;
  summary: string;
  credibility: number;
  importance: number;
  sourcesLine: string;
  sourceUrls: string[];
  sources: Array<{ name: string; url: string | null }>;
};

export function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sourceLinksHtml(sources: Array<{ name: string; url: string | null }>): string {
  return sources
    .slice(0, 4)
    .map((source) => {
      const name = escapeHtml(source.name);
      if (!source.url) return `<b>${name}</b>`;
      const href = escapeHtml(source.url);
      return `<a href="${href}">${name}</a>`;
    })
    .join(" \u00B7 ");
}

function credibilityDot(score: number): string {
  if (score >= 85) return "\u{1F7E2}";
  if (score >= 70) return "\u{1F7E1}";
  return "\u{1F7E0}";
}

export function formatDigest(title: string, items: WrittenItem[], footer: string): string {
  const blocks = items.map((item, index) => {
    const mark = CIRCLED[index] ?? `${item.rank}.`;
    return [
      `<b>${mark} ${escapeHtml(item.headline)}</b>`,
      "",
      escapeHtml(item.summary),
      "",
      `${credibilityDot(item.credibility)} ${LABEL_CREDIBILITY}: ${item.credibility}%`,
      `\u{1F525} ${LABEL_IMPORTANCE}: ${item.importance}/100`,
      "",
      `${LABEL_SOURCES}: ${sourceLinksHtml(item.sources)}`,
    ].join("\n");
  });

  return [`\u{1F1FA}\u{1F1E6} <b>${escapeHtml(title)}</b>`, "", blocks.join("\n\n\u2014\u2014\u2014\u2014\n\n"), "", escapeHtml(footer)].join("\n").trim();
}

export async function writeDigestItems(events: EventForSelection[]): Promise<WrittenItem[]> {
  const maxItems = loadEnv().DIGEST_NEWS_COUNT;
  const written: WrittenItem[] = [];

  for (const event of events) {
    if (written.length >= maxItems) break;
    const full = await prisma.event.findUniqueOrThrow({
      where: { id: event.id },
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
        analyses: { where: { kind: "credibility" }, orderBy: { createdAt: "desc" }, take: 1 },
      },
    });

    const rawItems = full.sources.map((link) => link.rawNews as RawNewsWithSource);
    const sources = uniqueSources(rawItems);
    const names = sources.map((source) => source.name);
    const urls = sources.map((source) => source.url).filter((url): url is string => Boolean(url));
    const credibilityReason = (full.analyses[0]?.output as { reason?: string } | null)?.reason;
    const sourceSnippets = rawItems.slice(0, 5).map((item) => ({
      source: item.source?.name ?? item.telegramSource?.name,
      title: item.title,
      text: (item.content ?? item.summary ?? "").slice(0, 400),
    }));

    let headline = event.title;
    let summary = event.normalizedSummary ?? event.title;

    try {
      const ai = await structuredComplete({
        name: "summary",
        model: "fast",
        system: summaryPrompt.system,
        user: summaryPrompt.user({
          title: event.title,
          facts: event.normalizedSummary,
          source_snippets: sourceSnippets,
          location: event.location,
          verification_status: event.verificationStatus,
          credibility_reason: credibilityReason,
          source_names: names,
        }),
        schema: jsonSchemas.summary.schema,
        zodSchema: summarySchema,
      });
      headline = clampText(ai.headline, 140);
      summary = clampText(ai.summary, 520);
    } catch (error) {
      logger.warn({ err: error, eventId: event.id }, "summary AI failed; using stored text");
    }

    if (
      headline.startsWith("SKIP") ||
      isVagueCopy(headline, summary) ||
      isOfficialNoise(headline, summary, rawItems)
    ) {
      logger.info({ eventId: event.id, headline }, "skipped vague or empty digest item");
      continue;
    }
    const blob = `${headline} ${summary}`;
    if (written.some((item) => tooSimilar(`${item.headline} ${item.summary}`, blob))) {
      logger.info({ eventId: event.id, headline }, "skipped similar digest item");
      continue;
    }

    written.push({
      eventId: event.id,
      rank: written.length + 1,
      headline,
      summary,
      credibility: event.credibilityScore,
      importance: event.importanceScore,
      sourcesLine: names.slice(0, 4).join(" \u00B7 "),
      sourceUrls: urls.slice(0, 3),
      sources,
    });
  }

  return written;
}

export function defaultDigestTitle(count: number): string {
  const n = Math.max(0, count);
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (n === 1 || (mod10 === 1 && mod100 !== 11)) {
    return `${n} \u0413\u041e\u041b\u041e\u0412\u041d\u0410 \u041d\u041e\u0412\u0418\u041d\u0410 ${TITLE_DAY}`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${n} \u0413\u041e\u041b\u041e\u0412\u041d\u0406 \u041d\u041e\u0412\u0418\u041d\u0418 ${TITLE_DAY}`;
  }
  return `${n} \u0413\u041e\u041b\u041e\u0412\u041d\u0418\u0425 \u041d\u041e\u0412\u0418\u041d ${TITLE_DAY}`;
}

export function defaultFooter(): string {
  return `\u{1F916} ${FOOTER_UK}`;
}
