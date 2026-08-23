import type { Event, EventCategory, Category } from "@prisma/client";
import { loadEnv } from "../config/env.ts";
import { logger } from "../logger.ts";
import type { RawNewsWithSource } from "./grouping.ts";
import { isOfficialNoise, tooSimilar } from "./quality.ts";

export type EventForSelection = Event & {
  categories: Array<EventCategory & { category: Category }>;
  sources?: Array<{ rawNews: RawNewsWithSource }>;
};

export function selectTopEvents(events: EventForSelection[]): EventForSelection[] {
  const env = loadEnv();
  const eligible = events.filter((event) => {
    if (event.credibilityScore < env.MIN_CREDIBILITY_SCORE) return false;
    if (event.importanceScore < env.MIN_IMPORTANCE_SCORE) return false;
    if (event.verificationStatus === "contradicted") return false;
    const items = event.sources?.map((link) => link.rawNews) ?? [];
    if (items.length > 0 && isOfficialNoise(event.title, event.normalizedSummary ?? "", items)) return false;
    return true;
  });

  const ranked = [...eligible].sort((a, b) => {
    if (b.importanceScore !== a.importanceScore) return b.importanceScore - a.importanceScore;
    return b.credibilityScore - a.credibilityScore;
  });

  const selected: EventForSelection[] = [];
  const perCategory = new Map<string, number>();

  for (const event of ranked) {
    if (selected.length >= env.DIGEST_NEWS_COUNT) break;
    const slug = event.categories[0]?.category.slug ?? "other";
    const used = perCategory.get(slug) ?? 0;
    if (used >= env.MAX_PER_CATEGORY && ranked.length - selected.length > 1) {
      continue;
    }
    const similar = selected.some((other) => tooSimilar(`${other.title} ${other.normalizedSummary ?? ""}`, `${event.title} ${event.normalizedSummary ?? ""}`));
    if (similar) continue;
    selected.push(event);
    perCategory.set(slug, used + 1);
  }

  if (selected.length < env.DIGEST_NEWS_COUNT) {
    for (const event of ranked) {
      if (selected.length >= env.DIGEST_NEWS_COUNT) break;
      if (!selected.includes(event)) selected.push(event);
    }
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
