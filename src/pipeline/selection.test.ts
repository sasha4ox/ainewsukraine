import assert from "node:assert/strict";
import { test } from "node:test";
import { resetEnvCache } from "../config/env.ts";
import { selectTopEvents, type EventForSelection } from "./selection.ts";

function event(partial: Partial<EventForSelection> & { slug: string; importanceScore: number; credibilityScore: number }): EventForSelection {
  return {
    id: partial.id ?? `${partial.slug}-${partial.importanceScore}`,
    title: partial.title ?? `Україна ${partial.slug} ${partial.importanceScore}`,
    normalizedSummary: partial.normalizedSummary ?? `${partial.slug} ${partial.importanceScore} `.repeat(6),
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

test("drops foreign news even when the model scores it highly", () => {
  process.env.DATABASE_URL = "postgresql://localhost:5432/news";
  process.env.MIN_CREDIBILITY_SCORE = "60";
  process.env.MIN_IMPORTANCE_SCORE = "40";
  process.env.DIGEST_NEWS_COUNT = "10";
  process.env.MAX_PER_CATEGORY = "3";
  resetEnvCache();

  const selected = selectTopEvents([
    event({
      slug: "international",
      title: "Трамп не втручатиметься в ситуацію в Бразилії",
      normalizedSummary: "Болсонару виїхав до США.",
      importanceScore: 80,
      credibilityScore: 80,
    }),
    event({
      slug: "economy",
      title: "НБУ підвищив облікову ставку",
      normalizedSummary: "Рішення Національного банку України.",
      importanceScore: 60,
      credibilityScore: 75,
    }),
  ]);

  assert.equal(selected.length, 1);
  assert.match(selected[0].title, /НБУ/);
});

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
