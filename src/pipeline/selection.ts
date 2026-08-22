import type { Event, EventCategory, Category } from "@prisma/client";
import { loadEnv } from "../config/env.ts";
import { logger } from "../logger.ts";

export type EventForSelection = Event & {
  categories: Array<EventCategory & { category: Category }>;
};

export function selectTopEvents(events: EventForSelection[]): EventForSelection[] {
  const env = loadEnv();
  const eligible = events.filter(
    (event) =>
      event.credibilityScore >= env.MIN_CREDIBILITY_SCORE &&
      event.importanceScore >= env.MIN_IMPORTANCE_SCORE &&
      event.verificationStatus !== "contradicted",
  );

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
