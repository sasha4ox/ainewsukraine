import { createHash } from "node:crypto";
import { normalizeForHash } from "./text.ts";

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function contentHash(parts: {
  sourceKey: string;
  title: string;
  body: string;
  externalId: string;
}): string {
  const payload = [
    normalizeForHash(parts.sourceKey),
    normalizeForHash(parts.externalId),
    normalizeForHash(parts.title),
    normalizeForHash(parts.body).slice(0, 2000),
  ].join("|");
  return sha256(payload);
}

export function bodyHash(title: string, body: string): string {
  return sha256(`${normalizeForHash(title)}|${normalizeForHash(body).slice(0, 4000)}`);
}
