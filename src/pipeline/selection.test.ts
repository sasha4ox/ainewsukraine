import assert from "node:assert/strict";
import { test } from "node:test";
import { resetEnvCache } from "../config/env.ts";
import { selectTopEvents, type EventForSelection } from "./selection.ts";

function event(partial: Partial<EventForSelection> & { slug: string; importanceScore: number; credibilityScore: number }): EventForSelection {
  return {
    id: partial.id ?? `${partial.slug}-${partial.importanceScore}`,
    title: partial.title ?? partial.slug,
    normalizedSummary: "",
    eventTime: new Date(),
    location: null,
    importanceScore: partial.importanceScore,
    credibilityScore: partial.credibilityScore,
    verificationStatus: partial.verificationStatus ?? "mostly_confirmed",
    primarySourceUrl: null,
    digestDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    categories: [
      {
        eventId: "x",
        categoryId: partial.slug,
        category: { id: partial.slug, slug: partial.slug, nameUk: partial.slug, nameEn: partial.slug, createdAt: new Date() },
      },
    ],
  };
}

test("does not pad to 10 and skips contradicted or low-credibility events", () => {
  process.env.DATABASE_URL = "postgresql://localhost:5432/news";
  process.env.DIGEST_NEWS_COUNT = "10";
  process.env.MIN_CREDIBILITY_SCORE = "70";
  process.env.MAX_PER_CATEGORY = "3";
  resetEnvCache();

  const selected = selectTopEvents([
    event({ slug: "war", importanceScore: 90, credibilityScore: 80 }),
    event({ slug: "economy", importanceScore: 85, credibilityScore: 75 }),
    event({ slug: "war", importanceScore: 99, credibilityScore: 40 }),
    event({ slug: "politics", importanceScore: 88, credibilityScore: 90, verificationStatus: "contradicted" }),
  ]);

  assert.equal(selected.length, 2);
  assert.ok(selected.every((item) => item.credibilityScore >= 70));
});
