import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDigest, type WrittenItem } from "./digest.ts";
import { isOfficialNoise, isVagueCopy } from "./quality.ts";

test("rejects empty official statement copy", () => {
  assert.equal(
    isVagueCopy(
      "\u041f\u0440\u0435\u0437\u0438\u0434\u0435\u043d\u0442 \u0423\u043a\u0440\u0430\u0457\u043d\u0438 \u0437\u0440\u043e\u0431\u0438\u0432 \u043e\u0444\u0456\u0446\u0456\u0439\u043d\u0443 \u0437\u0430\u044f\u0432\u0443",
      "\u0414\u0435\u0442\u0430\u043b\u0456 \u0437\u0430\u044f\u0432\u0438 \u043d\u0430\u0440\u0430\u0437\u0456 \u0434\u043e\u0441\u0442\u0443\u043f\u043d\u0456 \u0432 \u043e\u0444\u0456\u0446\u0456\u0439\u043d\u0438\u0445 \u043a\u0430\u043d\u0430\u043b\u0430\u0445 \u043f\u0440\u0435\u0437\u0438\u0434\u0435\u043d\u0442\u0430.",
    ),
    true,
  );
});

test("keeps a concrete incident", () => {
  assert.equal(
    isOfficialNoise(
      "\u0423 \u041a\u0440\u0438\u0432\u043e\u043c\u0443 \u0420\u043e\u0437\u0456 \u0437\u0430\u0433\u0438\u043d\u0443\u043b\u043e 16 \u043b\u044e\u0434\u0435\u0439",
      "\u0423\u0434\u0430\u0440 \u043f\u043e \u0422\u0420\u0426, 16 \u0437\u0430\u0433\u0438\u0431\u043b\u0438\u0445.",
      [],
    ),
    false,
  );
});

test("formats tenth mark and named links without raw urls", () => {
  const item = (rank: number): WrittenItem => ({
    eventId: String(rank),
    rank,
    headline: `Story ${rank}`,
    summary: "Short factual summary about a concrete event with enough text here.",
    credibility: 80,
    importance: 80,
    sourcesLine: "Suspilne",
    sourceUrls: ["https://suspilne.media/1"],
    sources: [{ name: "\u0421\u0443\u0441\u043f\u0456\u043b\u044c\u043d\u0435", url: "https://suspilne.media/1" }],
  });
  const body = formatDigest("10 TITLE", Array.from({ length: 10 }, (_, i) => item(i + 1)), "footer");
  assert.match(body, /\u{1F51F}/u);
  assert.doesNotMatch(body, /10\uFE0F\u20E3/);
  assert.match(body, /<a href="https:\/\/suspilne.media\/1">/);
  assert.match(body, /\u2014\u2014\u2014\u2014/);
});
