import type { Event, EventCategory, Category } from "@prisma/client";
import { loadEnv } from "../config/env.ts";
import { logger } from "../logger.ts";
import type { RawNewsWithSource } from "./grouping.ts";
import { isUkraineRelevant } from "../normalize/relevance.ts";
import { hasIndependentMedia, isOfficialNoise, noiseBucket, tooSimilar } from "./quality.ts";

export type EventForSelection = Event & {
  categories: Array<EventCategory & { category: Category }>;
  sources?: Array<{ rawNews: RawNewsWithSource }>;
};

function eventItems(event: EventForSelection): RawNewsWithSource[] {
  return event.sources?.map((link) => link.rawNews) ?? [];
}

function mediaBoost(event: EventForSelection): number {
  return hasIndependentMedia(eventItems(event)) ? 1 : 0;
}

export function selectTopEvents(events: EventForSelection[]): EventForSelection[] {
  const env = loadEnv();
  const poolLimit = Math.max(env.DIGEST_NEWS_COUNT * 3, env.DIGEST_NEWS_COUNT);
  const categoryCap = env.MAX_PER_CATEGORY * 2;

  const eligible = events.filter((event) => {
    if (event.credibilityScore < env.MIN_CREDIBILITY_SCORE) return false;
    if (event.importanceScore < env.MIN_IMPORTANCE_SCORE) return false;
    if (event.verificationStatus === "contradicted") return false;
    if (!isUkraineRelevant(`${event.title} ${event.normalizedSummary ?? ""}`)) return false;
    const items = eventItems(event);
    if (isOfficialNoise(event.title, event.normalizedSummary ?? "", items)) return false;
    return true;
  });

  const ranked = [...eligible].sort((a, b) => {
    if (mediaBoost(b) !== mediaBoost(a)) return mediaBoost(b) - mediaBoost(a);
    if (b.importanceScore !== a.importanceScore) return b.importanceScore - a.importanceScore;
    return b.credibilityScore - a.credibilityScore;
  });

  const selected: EventForSelection[] = [];
  const perCategory = new Map<string, number>();
  const buckets = new Set<string>();

  for (const event of ranked) {
    if (selected.length >= poolLimit) break;
    const slug = event.categories[0]?.category.slug ?? "other";
    const used = perCategory.get(slug) ?? 0;
    if (used >= categoryCap && ranked.length - selected.length > 1) {
      continue;
    }
    const blob = `${event.title} ${event.normalizedSummary ?? ""}`;
    const bucket = noiseBucket(event.title, event.normalizedSummary ?? "");
    if (bucket && buckets.has(bucket)) continue;
    const similar = selected.some((other) => tooSimilar(`${other.title} ${other.normalizedSummary ?? ""}`, blob));
    if (similar) continue;
    selected.push(event);
    perCategory.set(slug, used + 1);
    if (bucket) buckets.add(bucket);
  }

  logger.info(
    {
      considered: events.length,
      eligible: eligible.length,
      selected: selected.length,
      ids: selected.map((event) => event.id),
    },
    "selected top events",
  );

  return selected;
}
