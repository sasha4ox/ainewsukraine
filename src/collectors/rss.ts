import Parser from "rss-parser";
import { loadEnv } from "../config/env.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { withRetry } from "../lib/retry.ts";
import { bodyHash, contentHash } from "../normalize/hash.ts";
import { isUkraineRelevant } from "../normalize/relevance.ts";
import { firstSentence, sanitizeText, stripHtml, truncateText } from "../normalize/text.ts";

const parser = new Parser({
  timeout: 20_000,
  headers: {
    "User-Agent": "ChomuNeUkrainskoyu/0.1 (+https://github.com/sasha4ox/ainewsukraine)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
});

function looksLikeFeed(body: string): boolean {
  const head = body.slice(0, 400).toLowerCase();
  return head.includes("<rss") || head.includes("<feed") || head.includes("<rdf");
}

async function fetchFeedXml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "ChomuNeUkrainskoyu/0.1 (+https://github.com/sasha4ox/ainewsukraine)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
    redirect: "follow",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }
  const body = await response.text();
  if (!looksLikeFeed(body)) {
    throw new Error(`Response from ${url} is not RSS/Atom (content-type was ${response.headers.get("content-type")})`);
  }
  return body;
}

export async function collectRss(): Promise<{ collected: number; duplicates: number; irrelevant: number; failed: number }> {
  loadEnv();
  const sources = await prisma.source.findMany({
    where: { enabled: true, type: "RSS" },
  });

  let collected = 0;
  let duplicates = 0;
  let irrelevant = 0;
  let failed = 0;

  for (const source of sources) {
    try {
      const xml = await withRetry(() => fetchFeedXml(source.url), { attempts: 2, baseMs: 800 });
      const feed = await parser.parseString(xml);
      const items = feed.items ?? [];
      let sourceCollected = 0;
      let sourceDupes = 0;
      let sourceIrrelevant = 0;

      for (const item of items) {
        const url = item.link?.trim() || item.guid?.trim();
        const title = sanitizeText(stripHtml(item.title ?? "")).trim();
        if (!url || !title) continue;

        const body = sanitizeText(stripHtml(item.contentSnippet ?? item.content ?? item.summary ?? ""));
        if (!isUkraineRelevant(`${title}\n${body}`)) {
          sourceIrrelevant += 1;
          continue;
        }
        const publishedAt = item.isoDate
          ? new Date(item.isoDate)
          : item.pubDate
            ? new Date(item.pubDate)
            : new Date();
        if (Number.isNaN(publishedAt.getTime())) continue;

        const externalId = (item.guid ?? url).trim();
        const hash = contentHash({
          sourceKey: `rss:${source.id}`,
          title,
          body,
          externalId,
        });

        try {
          await prisma.rawNews.create({
            data: {
              title,
              summary: firstSentence(body || title),
              content: truncateText(body, 8000) || null,
              sourceId: source.id,
              sourceType: "rss",
              url,
              publishedAt,
              language: source.language,
              externalId,
              contentHash: hash,
              bodyHash: bodyHash(title, body),
            },
          });
          sourceCollected += 1;
        } catch (error) {
          const code = (error as { code?: string }).code;
          if (code === "P2002") {
            sourceDupes += 1;
            continue;
          }
          if (code === "InvalidArg") {
            logger.warn({ source: source.name, url }, "skipped rss item prisma refused to store");
            continue;
          }
          throw error;
        }
      }

      collected += sourceCollected;
      duplicates += sourceDupes;
      irrelevant += sourceIrrelevant;
      logger.info(
        {
          source: source.name,
          items: items.length,
          collected: sourceCollected,
          duplicates: sourceDupes,
          irrelevant: sourceIrrelevant,
        },
        "rss source collected",
      );
    } catch (error) {
      failed += 1;
      logger.error({ err: error, source: source.name, url: source.url }, "rss source failed");
    }
  }

  return { collected, duplicates, irrelevant, failed };
}
