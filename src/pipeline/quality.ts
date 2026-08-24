import { jaccard, shingles } from "../normalize/text.ts";
import { isOfficialItem, sourceDisplayName, type RawNewsWithSource } from "./grouping.ts";

const EMPTY_STORY =
  /офіційн(у|а|ої)?\s+заяв|зробив(а)?\s+заяв|зробила\s+заяв|виступив\s+з.{0,20}заяв|заяв[аи]\s+президента|кільк(а|ома)\s+заяв|додатков(і|их)\s+заяв|заяви\s+охоплюють|official statement|привітав|привітає|вітання|день державного|нові дані про надзвичай|надзвичайні ситуац|звіт про надзвичай|деталі заяви наразі|конкретні деталі не|деталі не розкрит|деталі не надан|підтверджен[аоі]\s+через офіційн|офіційні канали/i;

const CEREMONY =
  /нагород|річниц|з нагоди|бойов(і|их|ого)\s+прапор|стрічк(и|у)\s+почесн|відновлення незалежн/i;

const CONSEQUENCE = /загиб|поранен|травмова|пожеж|вибух|зруйнов|вбит|загинул/i;

const NAMED_TARGET =
  /комбінат|азс|автозаправ|трц|лікарн|школ|завод|склад|підстанц|електростанц|аеродром/i;

const STRIKE = /удар|атак|обстріл|ракет|дрон|\bкаб\b/i;

const POLICY = /закон|санкц|перемовин|угод/i;

const SOURCE_UK: Record<string, string> = {
  "President of Ukraine": "Президент України",
  DSNS: "ДСНС",
  "Air Force of Ukraine": "Повітряні сили ЗСУ",
  "General Staff ZSU": "Генштаб ЗСУ",
  "Cabinet of Ministers": "Кабмін",
  "Ukrainska Pravda": "Українська правда",
  "European Pravda": "Європейська правда",
  "Radio Svoboda": "Радіо Свобода",
  "Hromadske Radio": "Громадське радіо",
  Suspilne: "Суспільне",
  Ukrinform: "Укрінформ",
  Blyskavka: "Блискавка",
};

export function localizeSourceName(name: string): string {
  return SOURCE_UK[name] ?? name;
}

export function hasIndependentMedia(items: RawNewsWithSource[]): boolean {
  return items.some((item) => Boolean(item.source) && !item.source?.isOfficial);
}

export function isCeremony(text: string): boolean {
  return CEREMONY.test(text);
}

export function isEmptyOfficialCopy(text: string): boolean {
  return EMPTY_STORY.test(text);
}

export function isConcreteStory(text: string): boolean {
  if (CONSEQUENCE.test(text)) return true;
  if (NAMED_TARGET.test(text) && STRIKE.test(text)) return true;
  if (POLICY.test(text) && !isEmptyOfficialCopy(text)) return true;
  return false;
}

export function noiseBucket(title: string, summary: string): string | null {
  const text = `${title} ${summary}`;
  if (isCeremony(text)) return "ceremony";
  if (!isEmptyOfficialCopy(text)) return null;
  if (/президент|зеленськ/i.test(text)) return "president-empty";
  if (/дснс|надзвичай/i.test(text)) return "dsns-empty";
  if (/повітряні сили|генштаб/i.test(text)) return "mod-empty";
  return "official-empty";
}

export function isOfficialNoise(title: string, summary: string, items: RawNewsWithSource[]): boolean {
  const text = `${title} ${summary}`;
  if (isCeremony(text)) return true;
  if (isEmptyOfficialCopy(text) && !isConcreteStory(text)) return true;
  const officialOnly = items.length > 0 && !hasIndependentMedia(items);
  if (officialOnly && !isConcreteStory(text)) return true;
  return false;
}

export function isVagueCopy(headline: string, summary: string): boolean {
  const text = `${headline} ${summary}`;
  if (headline.startsWith("SKIP")) return true;
  if (isCeremony(text)) return true;
  if (isEmptyOfficialCopy(text) && !isConcreteStory(text)) return true;
  if (summary.trim().length < 80 && !isConcreteStory(text)) return true;
  return false;
}

export function tooSimilar(a: string, b: string): boolean {
  return jaccard(shingles(a), shingles(b)) >= 0.34;
}

export function uniqueSources(items: RawNewsWithSource[]): Array<{ name: string; url: string | null }> {
  const out: Array<{ name: string; url: string | null }> = [];
  for (const item of items) {
    const name = localizeSourceName(sourceDisplayName(item));
    if (out.some((row) => row.name === name)) continue;
    out.push({ name, url: item.url });
  }
  return out;
}
