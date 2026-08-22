const PUNCT_RE = /[^\p{L}\p{N}\s]+/gu;
const SPACE_RE = /\s+/g;

export function stripHtml(input: string): string {
  return input
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeForHash(input: string): string {
  return stripHtml(input).replace(/\s+/g, " ").trim().toLowerCase();
}

export function normalizeForCluster(input: string): string {
  return stripHtml(input)
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/й/g, "и")
    .replace(PUNCT_RE, " ")
    .replace(SPACE_RE, " ")
    .trim();
}

export function shingles(text: string, size = 5): Set<string> {
  const normalized = normalizeForCluster(text);
  const compact = normalized.replace(/ /g, "");
  const out = new Set<string>();
  if (compact.length <= size) {
    if (compact.length > 0) out.add(compact);
    return out;
  }
  for (let i = 0; i <= compact.length - size; i += 1) {
    out.add(compact.slice(i, i + size));
  }
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  for (const item of smaller) {
    if (larger.has(item)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function firstSentence(text: string, max = 220): string {
  const clean = stripHtml(text);
  const match = clean.match(/(.+?[.!?…])(\s|$)/);
  const sentence = (match?.[1] ?? clean).trim();
  if (sentence.length <= max) return sentence;
  return `${sentence.slice(0, max - 1).trimEnd()}…`;
}

export function clampText(text: string, max: number): string {
  const clean = stripHtml(text);
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}
