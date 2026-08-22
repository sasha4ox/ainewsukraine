import assert from "node:assert/strict";
import { test } from "node:test";
import { computeCredibilityBase, statusFromScore } from "./credibility.ts";
import type { IndependenceResult } from "./independence.ts";
import type { RawNewsWithSource } from "./grouping.ts";

function item(overrides: Partial<RawNewsWithSource> = {}): RawNewsWithSource {
  return {
    id: overrides.id ?? "1",
    title: "Test",
    summary: "Test",
    content: "Test",
    sourceId: "s1",
    telegramSourceId: null,
    sourceType: "rss",
    url: "https://example.com/1",
    publishedAt: new Date(),
    language: "uk",
    externalId: "1",
    contentHash: "h",
    bodyHash: "b",
    createdAt: new Date(),
    source: { name: "BBC", organization: "BBC", isOfficial: false, reliabilityScore: 90 },
    telegramSource: null,
    ...overrides,
  };
}

const emptyIndependence: IndependenceResult = {
  independentOrgs: [],
  officialConfirmation: false,
  officialNames: [],
  primaryUrl: null,
  anonymous: false,
  contradictions: [],
  telegramOnly: true,
};

test("telegram-only unverified claim stays well below publish threshold", () => {
  const score = computeCredibilityBase(
    [
      item({
        sourceType: "telegram",
        source: null,
        telegramSource: {
          name: "Blyskavka",
          organization: "Blyskavka",
          officialSourceId: null,
          reliabilityScore: 45,
          sourceType: "public_channel",
        },
      }),
    ],
    { ...emptyIndependence, independentOrgs: ["Blyskavka"], telegramOnly: true, primaryUrl: "https://t.me/x/1" },
  );
  assert.ok(score < 70);
});

test("official plus two reliable independents scores high", () => {
  const score = computeCredibilityBase(
    [
      item({ id: "1", source: { name: "BBC", organization: "BBC", isOfficial: false, reliabilityScore: 90 } }),
      item({ id: "2", source: { name: "Suspilne", organization: "Suspilne", isOfficial: false, reliabilityScore: 85 } }),
      item({
        id: "3",
        sourceType: "official_telegram",
        source: null,
        telegramSource: {
          name: "General Staff",
          organization: "General Staff ZSU",
          officialSourceId: "off1",
          reliabilityScore: 94,
          sourceType: "official",
        },
      }),
    ],
    {
      independentOrgs: ["BBC", "Suspilne", "General Staff ZSU"],
      officialConfirmation: true,
      officialNames: ["General Staff"],
      primaryUrl: "https://bbc.com/1",
      anonymous: false,
      contradictions: [],
      telegramOnly: false,
    },
  );
  assert.ok(score >= 80);
});

test("contradictions force contradicted status", () => {
  assert.equal(statusFromScore(95, true), "contradicted");
  assert.equal(statusFromScore(90, false), "confirmed");
  assert.equal(statusFromScore(72, false), "mostly_confirmed");
  assert.equal(statusFromScore(50, false), "unconfirmed");
});
