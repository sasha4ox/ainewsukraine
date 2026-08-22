import type { Prisma, RawNews } from "@prisma/client";
import { structuredComplete } from "../ai/client.ts";
import { classificationPrompt } from "../ai/prompts/classification.ts";
import { duplicateDetectionPrompt } from "../ai/prompts/duplicate-detection.ts";
import { eventGroupingPrompt } from "../ai/prompts/event-grouping.ts";
import { classificationSchema, duplicateDetectionSchema, eventGroupingSchema, jsonSchemas } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { firstSentence } from "../normalize/text.ts";
import { clusterItems } from "./cluster.ts";

export type RawNewsWithSource = RawNews & {
  source: { name: string; organization: string | null; isOfficial: boolean; reliabilityScore: number } | null;
  telegramSource: {
    name: string;
    organization: string | null;
    officialSourceId: string | null;
    reliabilityScore: number;
    sourceType: string;
  } | null;
};

const rawNewsInclude = {
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
} satisfies Prisma.RawNewsInclude;

export function sourceDisplayName(item: RawNewsWithSource): string {
  return item.source?.name ?? item.telegramSource?.name ?? item.sourceType;
}

export function sourceOrganization(item: RawNewsWithSource): string {
  return item.source?.organization ?? item.telegramSource?.organization ?? sourceDisplayName(item);
}

export function isOfficialItem(item: RawNewsWithSource): boolean {
  return Boolean(item.source?.isOfficial || item.telegramSource?.officialSourceId);
}

export async function loadUngroupedNews(start: Date, end: Date): Promise<RawNewsWithSource[]> {
  const already = await prisma.eventSource.findMany({
    where: { rawNews: { publishedAt: { gte: start, lte: end } } },
    select: { rawNewsId: true },
  });
  const used = new Set(already.map((row) => row.rawNewsId));

  const items = await prisma.rawNews.findMany({
    where: { publishedAt: { gte: start, lte: end } },
    include: rawNewsInclude,
    orderBy: { publishedAt: "asc" },
  });

  return items.filter((item) => !used.has(item.id) && (item.title.trim() || item.content?.trim()));
}

export async function groupEvents(items: RawNewsWithSource[], digestDate: Date): Promise<string[]> {
  if (items.length === 0) return [];

  const byId = new Map(items.map((item) => [item.id, item]));
  const clusters = clusterItems(
    items.map((item) => ({
      id: item.id,
      title: item.title,
      content: item.content ?? item.summary ?? "",
      publishedAt: item.publishedAt,
    })),
  );

  logger.info({ clusters: clusters.length, items: items.length }, "pre-clustered raw news");
  const eventIds: string[] = [];

  for (const cluster of clusters) {
    const clusterItemsResolved = cluster.itemIds
      .map((id) => byId.get(id))
      .filter((item): item is RawNewsWithSource => Boolean(item));
    if (clusterItemsResolved.length === 0) continue;

    try {
      const created = await createEventsFromCluster(clusterItemsResolved, digestDate);
      eventIds.push(...created);
    } catch (error) {
      logger.error({ err: error, size: clusterItemsResolved.length }, "event grouping failed; using heuristic");
      const created = await createHeuristicEvent(clusterItemsResolved, digestDate);
      eventIds.push(created);
    }
  }

  return eventIds;
}

async function createEventsFromCluster(items: RawNewsWithSource[], digestDate: Date): Promise<string[]> {
  if (items.length === 1) {
    return [await createHeuristicEvent(items, digestDate)];
  }

  if (items.length === 2) {
    try {
      const dup = await structuredComplete({
        name: "duplicate_detection",
        model: "fast",
        system: duplicateDetectionPrompt.system,
        user: duplicateDetectionPrompt.user(
          { title: items[0].title, content: items[0].content ?? items[0].summary ?? "" },
          { title: items[1].title, content: items[1].content ?? items[1].summary ?? "" },
        ),
        schema: jsonSchemas.duplicate_detection.schema,
        zodSchema: duplicateDetectionSchema,
      });
      if (!dup.is_same_event) {
        return [
          await createHeuristicEvent([items[0]], digestDate),
          await createHeuristicEvent([items[1]], digestDate),
        ];
      }
    } catch {
      // fall through to grouping
    }
  }

  const payload = items.map((item, index) => ({
    index,
    sourceName: sourceDisplayName(item),
    title: item.title,
    content: item.content ?? item.summary ?? "",
    publishedAt: item.publishedAt.toISOString(),
  }));

  const grouped = await structuredComplete({
    name: "event_grouping",
    model: "fast",
    system: eventGroupingPrompt.system,
    user: eventGroupingPrompt.user(payload),
    schema: jsonSchemas.event_grouping.schema,
    zodSchema: eventGroupingSchema,
  });

  const used = new Set<number>();
  const eventIds: string[] = [];

  for (const group of grouped.events) {
    const members = [...new Set(group.item_indexes)]
      .filter((index) => index >= 0 && index < items.length && !used.has(index))
      .map((index) => {
        used.add(index);
        return items[index];
      });
    if (members.length === 0) continue;
    eventIds.push(await persistEvent(members, digestDate, group.title, group.summary, group.category, group.location, group.event_time));
  }

  const leftover = items.filter((_, index) => !used.has(index));
  if (leftover.length > 0) {
    eventIds.push(await createHeuristicEvent(leftover, digestDate));
  }

  return eventIds;
}

async function createHeuristicEvent(items: RawNewsWithSource[], digestDate: Date): Promise<string> {
  const primary = items[0];
  let category = "other";
  let location: string | null = null;
  try {
    const classified = await structuredComplete({
      name: "classification",
      model: "fast",
      system: classificationPrompt.system,
      user: classificationPrompt.user({
        title: primary.title,
        content: primary.content ?? primary.summary ?? "",
        sourceName: sourceDisplayName(primary),
      }),
      schema: jsonSchemas.classification.schema,
      zodSchema: classificationSchema,
    });
    category = classified.category;
    location = classified.location;
  } catch {
    // keep defaults
  }
  return persistEvent(
    items,
    digestDate,
    primary.title,
    firstSentence(primary.summary ?? primary.content ?? primary.title, 400),
    category,
    location,
    primary.publishedAt.toISOString(),
  );
}

async function persistEvent(
  items: RawNewsWithSource[],
  digestDate: Date,
  title: string,
  summary: string,
  categorySlug: string,
  location: string | null,
  eventTimeRaw: string,
): Promise<string> {
  const eventTime = new Date(eventTimeRaw);
  const safeTime = Number.isNaN(eventTime.getTime()) ? items[0].publishedAt : eventTime;
  const category = await prisma.category.findUnique({ where: { slug: categorySlug } });

  const event = await prisma.event.create({
    data: {
      title: title.slice(0, 300),
      normalizedSummary: summary.slice(0, 2000),
      eventTime: safeTime,
      location,
      digestDate,
      primarySourceUrl: items.find((item) => item.url)?.url ?? null,
      sources: {
        create: items.map((item) => ({
          rawNewsId: item.id,
          role: isOfficialItem(item) ? "official" : "independent",
        })),
      },
      ...(category
        ? {
            categories: {
              create: { categoryId: category.id },
            },
          }
        : {}),
    },
  });

  await prisma.aiAnalysis.create({
    data: {
      eventId: event.id,
      kind: "grouping",
      model: "pipeline",
      promptName: "event_grouping",
      input: { rawNewsIds: items.map((item) => item.id) },
      output: { title, summary, category: categorySlug, location },
    },
  });

  return event.id;
}
