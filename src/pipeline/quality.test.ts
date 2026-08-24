import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDigest, type WrittenItem } from "./digest.ts";
import { isOfficialNoise, isVagueCopy } from "./quality.ts";
import type { RawNewsWithSource } from "./grouping.ts";

function official(name: string): RawNewsWithSource {
  return {
    source: { name, organization: name, isOfficial: true, reliabilityScore: 80 },
    telegramSource: {
      name,
      organization: name,
      officialSourceId: "off-1",
      reliabilityScore: 80,
      sourceType: "official",
    },
  } as RawNewsWithSource;
}

function media(name: string): RawNewsWithSource {
  return {
    source: { name, organization: name, isOfficial: false, reliabilityScore: 85 },
    telegramSource: null,
  } as RawNewsWithSource;
}

test("rejects empty official statement copy even with a date in the text", () => {
  const headline = "Президент України зробив заяви 24 серпня 2026 року";
  const summary =
    "24 серпня 2026 року Президент України виступив з кількома заявами, які були підтверджені офіційними джерелами. Конкретні деталі не надані.";
  assert.equal(isVagueCopy(headline, summary), true);
  assert.equal(isOfficialNoise(headline, summary, [official("President of Ukraine")]), true);
});

test("rejects generic DSNS situation reports", () => {
  const headline = "ДСНС повідомила про надзвичайні ситуації 24 серпня 2026 року";
  const summary =
    "Державна служба України з надзвичайних ситуацій опублікувала звіт про надзвичайні ситуації, що сталися 24 серпня 2026 року.";
  assert.equal(isOfficialNoise(headline, summary, [official("DSNS")]), true);
  assert.equal(isVagueCopy(headline, summary), true);
});

test("rejects independence-day awards as ceremony, not news", () => {
  const headline = "Президент України відзначив воїнів та цивільних нагородами з нагоди 35-ї річниці незалежності";
  const summary = "Президент України вручив державні нагороди воїнам та цивільним особам з нагоди 35-ї річниці відновлення незалежності.";
  assert.equal(isOfficialNoise(headline, summary, [official("President of Ukraine")]), true);
});

test("rejects official-only regional strike briefing without a named target", () => {
  const headline = "Атаки КАБ на Донеччину: Повітряні сили України завдали ударів";
  const summary =
    "З 23 по 24 серпня 2026 року Повітряні сили України здійснили серію атак з використанням керованих авіаційних бомб на території Донеччини.";
  assert.equal(isOfficialNoise(headline, summary, [official("Air Force of Ukraine")]), true);
});

test("keeps a named strike with independent media", () => {
  const headline = "Сили оборони України вразили комбінат «Каменський» у Ростовській області";
  const summary =
    "В ніч на 24 серпня підрозділи Сил оборони України завдали удару по комбінату «Каменський». На території об'єкта зафіксовано пожежу.";
  assert.equal(
    isOfficialNoise(headline, summary, [media("Radio Svoboda"), official("General Staff ZSU")]),
    false,
  );
  assert.equal(isVagueCopy(headline, summary), false);
});

test("keeps a concrete incident with casualties", () => {
  const headline = "У Новгород-Сіверському районі Чернігівщини росіяни вдарили по автозаправній станції, є постраждала";
  const summary =
    "Ввечері 23 серпня російські війська завдали удару по автозаправній станції. Внаслідок атаки травмована 59-річна працівниця АЗС, на території об'єкта виникла пожежа.";
  assert.equal(
    isOfficialNoise(headline, summary, [media("Ukrinform"), official("DSNS")]),
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
    sources: [{ name: "Суспільне", url: "https://suspilne.media/1" }],
  });
  const body = formatDigest("10 TITLE", Array.from({ length: 10 }, (_, i) => item(i + 1)), "footer");
  assert.match(body, /\u{1F51F}/u);
  assert.doesNotMatch(body, /10\uFE0F\u20E3/);
  assert.match(body, /<a href="https:\/\/suspilne.media\/1">/);
  assert.match(body, /\u2014\u2014\u2014\u2014/);
});
