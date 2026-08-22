import { structuredComplete } from "../ai/client.ts";
import { summaryPrompt } from "../ai/prompts/summary.ts";
import { jsonSchemas, summarySchema } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { clampText } from "../normalize/text.ts";
import { sourceDisplayName, type RawNewsWithSource } from "./grouping.ts";
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
  "10\uFE0F\u20E3",
];

const LABEL_CREDIBILITY = "\u0414\u043e\u0441\u0442\u043e\u0432\u0456\u0440\u043d\u0456\u0441\u0442\u044c";
const LABEL_IMPORTANCE = "\u0412\u0430\u0436\u043b\u0438\u0432\u0456\u0441\u0442\u044c";
const LABEL_SOURCES = "\u0414\u0436\u0435\u0440\u0435\u043b\u0430";
const TITLE_SUFFIX = "\u0413\u041e\u041b\u041e\u0412\u041d\u0418\u0425 \u041d\u041e\u0412\u0418\u041d \u0417\u0410 \u0414\u041e\u0411\u0423";
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
};

function credibilityDot(score: number): string {
  if (score >= 85) return "\u{1F7E2}";
  if (score >= 70) return "\u{1F7E1}";
  return "\u{1F7E0}";
}

export function formatDigest(title: string, items: WrittenItem[], footer: string): string {
  const blocks = items.map((item, index) => {
    const mark = CIRCLED[index] ?? `${item.rank}.`;
    const links = item.sourceUrls
      .slice(0, 3)
      .map((url) => url)
      .join("\n");
    return [
      `${mark} ${item.headline}`,
      "",
      item.summary,
      "",
      `${credibilityDot(item.credibility)} ${LABEL_CREDIBILITY}: ${item.credibility}%`,
      `\u{1F525} ${LABEL_IMPORTANCE}: ${item.importance}/100`,
      "",
      `${LABEL_SOURCES}: ${item.sourcesLine}`,
      links,
    ].join("\n");
  });

  return [`\u{1F1FA}\u{1F1E6} ${title}`, "", ...blocks, "", footer].join("\n").trim();
}

function uniqueSourceNames(items: RawNewsWithSource[]): string[] {
  const names: string[] = [];
  for (const item of items) {
    const name = sourceDisplayName(item);
    if (!names.includes(name)) names.push(name);
  }
  return names;
}

export async function writeDigestItems(events: EventForSelection[]): Promise<WrittenItem[]> {
  const written: WrittenItem[] = [];

  for (const [index, event] of events.entries()) {
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
    const names = uniqueSourceNames(rawItems);
    const urls = rawItems.map((item) => item.url).filter((url): url is string => Boolean(url));
    const credibilityReason = (full.analyses[0]?.output as { reason?: string } | null)?.reason;

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
          location: event.location,
          verification_status: event.verificationStatus,
          credibility_reason: credibilityReason,
          source_names: names,
          allowed_urls: urls,
        }),
        schema: jsonSchemas.summary.schema,
        zodSchema: summarySchema,
      });
      headline = clampText(ai.headline, 140);
      summary = clampText(ai.summary, 520);
    } catch (error) {
      logger.warn({ err: error, eventId: event.id }, "summary AI failed; using stored text");
    }

    written.push({
      eventId: event.id,
      rank: index + 1,
      headline,
      summary,
      credibility: event.credibilityScore,
      importance: event.importanceScore,
      sourcesLine: names.slice(0, 4).join(" \u00B7 "),
      sourceUrls: [...new Set(urls)].slice(0, 3),
    });
  }

  return written;
}

export function defaultDigestTitle(count: number): string {
  return `${count} ${TITLE_SUFFIX}`;
}

export function defaultFooter(): string {
  return `\u{1F916} ${FOOTER_UK}`;
}
