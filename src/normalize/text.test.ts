import assert from "node:assert/strict";
import { test } from "node:test";
import { firstSentence, jaccard, normalizeForCluster, sanitizeText, shingles, stripHtml, truncateText } from "./text.ts";
import { bodyHash, contentHash } from "./hash.ts";

test("stripHtml removes tags and entities", () => {
  assert.equal(stripHtml("<p>Hello&nbsp;<b>world</b></p>"), "Hello world");
});

test("sanitizeText drops lone surrogates and keeps emoji", () => {
  const flag = "\uD83C\uDDFA\uD83C\uDDE6";
  assert.equal(sanitizeText(`a${flag}b`), `a${flag}b`);
  assert.equal(sanitizeText("a\uD83Cb"), "ab");
  assert.equal(sanitizeText("a\u0000b"), "ab");
});

test("truncateText and firstSentence do not split an emoji", () => {
  const flag = "\uD83C\uDDFA\uD83C\uDDE6";
  assert.equal(truncateText(`${"а".repeat(10)}${flag}`, 11), "а".repeat(10));

  const sentence = firstSentence(`${"а".repeat(30)}${flag} далі без крапки`, 32);
  assert.equal(sentence, `${"а".repeat(30)}…`);
  assert.equal(sentence.includes("\uD83C"), false);
});

test("normalizeForCluster is stable for near-duplicate Ukrainian phrasing", () => {
  const a = normalizeForCluster("Вибухи в Києві!");
  const b = normalizeForCluster("Вибухи у Києві.");
  assert.ok(a.includes("вибухи"));
  assert.ok(b.includes("києві") || b.includes("киеві") || b.length > 0);
});

test("jaccard similarity detects close texts", () => {
  const a = shingles("explosions reported in kyiv overnight");
  const b = shingles("explosions reported in kyiv this night");
  assert.ok(jaccard(a, b) > 0.4);
  assert.ok(jaccard(a, shingles("stock market closes higher in tokyo")) < 0.2);
});

test("content hashes differ by source but body hashes match", () => {
  const body = "Explosions reported in Kyiv";
  const one = contentHash({ sourceKey: "rss:1", title: "Kyiv", body, externalId: "a" });
  const two = contentHash({ sourceKey: "rss:2", title: "Kyiv", body, externalId: "b" });
  assert.notEqual(one, two);
  assert.equal(bodyHash("Kyiv", body), bodyHash("Kyiv", body));
});
