import { jaccard, shingles } from "../normalize/text.ts";
import { isOfficialItem, sourceDisplayName, type RawNewsWithSource } from "./grouping.ts";

const EMPTY_STORY =
  /\u043e\u0444\u0456\u0446\u0456\u0439\u043d(\u0443|\u0430) \u0437\u0430\u044f\u0432|\u0437\u0440\u043e\u0431\u0438\u0432 \u0437\u0430\u044f\u0432|\u0437\u0440\u043e\u0431\u0438\u043b\u0430 \u0437\u0430\u044f\u0432|official statement|\u043f\u0440\u0438\u0432\u0456\u0442\u0430\u0432|\u043f\u0440\u0438\u0432\u0456\u0442\u0430\u0454|\u0434\u0435\u043d\u044c \u0434\u0435\u0440\u0436\u0430\u0432\u043d\u043e\u0433|\u043d\u043e\u0432\u0456 \u0434\u0430\u043d\u0456 \u043f\u0440\u043e \u043d\u0430\u0434\u0437\u0432\u0438\u0447\u0430\u0439|\u0434\u0435\u0442\u0430\u043b\u0456 \u0437\u0430\u044f\u0432\u0438 \u043d\u0430\u0440\u0430\u0437\u0456/i;

const CONCRETE_FACT =
  /\d+|\u0443\u0434\u0430\u0440|\u0430\u0442\u0430\u043a|\u0437\u0430\u0433\u0438\u0431|\u043f\u043e\u0440\u0430\u043d\u0435\u043d|\u0440\u0430\u043a\u0435\u0442|\u0434\u0440\u043e\u043d|\u0437\u0430\u043a\u043e\u043d|\u0441\u0430\u043d\u043a\u0446|\u043f\u0435\u0440\u0435\u043c\u043e\u0432\u0438\u043d|\u0443\u0433\u043e\u0434/;

const SOURCE_UK: Record<string, string> = {
  "President of Ukraine": "\u041f\u0440\u0435\u0437\u0438\u0434\u0435\u043d\u0442 \u0423\u043a\u0440\u0430\u0457\u043d\u0438",
  DSNS: "\u0414\u0421\u041d\u0421",
  "Air Force of Ukraine": "\u041f\u043e\u0432\u0456\u0442\u0440\u044f\u043d\u0456 \u0441\u0438\u043b\u0438 \u0417\u0421\u0423",
  "General Staff ZSU": "\u0413\u0435\u043d\u0448\u0442\u0430\u0431 \u0417\u0421\u0423",
  "Cabinet of Ministers": "\u041a\u0430\u0431\u043c\u0456\u043d",
  "Ukrainska Pravda": "\u0423\u043a\u0440\u0430\u0457\u043d\u0441\u044c\u043a\u0430 \u043f\u0440\u0430\u0432\u0434\u0430",
  "European Pravda": "\u0404\u0432\u0440\u043e\u043f\u0435\u0439\u0441\u044c\u043a\u0430 \u043f\u0440\u0430\u0432\u0434\u0430",
  "Radio Svoboda": "\u0420\u0430\u0434\u0456\u043e \u0421\u0432\u043e\u0431\u043e\u0434\u0430",
  "Hromadske Radio": "\u0413\u0440\u043e\u043c\u0430\u0434\u0441\u044c\u043a\u0435 \u0440\u0430\u0434\u0456\u043e",
  Suspilne: "\u0421\u0443\u0441\u043f\u0456\u043b\u044c\u043d\u0435",
  Ukrinform: "\u0423\u043a\u0440\u0456\u043d\u0444\u043e\u0440\u043c",
  Blyskavka: "\u0411\u043b\u0438\u0441\u043a\u0430\u0432\u043a\u0430",
};

export function localizeSourceName(name: string): string {
  return SOURCE_UK[name] ?? name;
}

export function hasIndependentMedia(items: RawNewsWithSource[]): boolean {
  return items.some((item) => Boolean(item.source) && !item.source?.isOfficial);
}

export function isOfficialNoise(title: string, summary: string, items: RawNewsWithSource[]): boolean {
  const text = `${title} ${summary}`;
  if (EMPTY_STORY.test(text) && !CONCRETE_FACT.test(text)) return true;
  if (!hasIndependentMedia(items) && EMPTY_STORY.test(text)) return true;
  if (!hasIndependentMedia(items) && items.every(isOfficialItem) && !CONCRETE_FACT.test(text)) return true;
  return false;
}

export function isVagueCopy(headline: string, summary: string): boolean {
  const text = `${headline} ${summary}`;
  if (summary.trim().length < 80) return true;
  if (EMPTY_STORY.test(text) && !CONCRETE_FACT.test(text)) return true;
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
