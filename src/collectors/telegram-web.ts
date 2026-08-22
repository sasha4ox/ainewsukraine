import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { advanceCheckpoint, storeTelegramMessage } from "./store-telegram.ts";

const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type WebMessage = {
  messageId: number;
  text: string;
  date: Date;
};

function decodeEntities(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
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

export function parseTelegramPreview(html: string, username: string): WebMessage[] {
  const blocks = html.split('class="tgme_widget_message');
  const out: WebMessage[] = [];

  for (const block of blocks) {
    const post = block.match(/data-post="([^"]+)"/);
    if (!post) continue;
    const [, channel, idRaw] = post[1].match(/^([^/]+)\/(\d+)$/) ?? [];
    if (!channel || channel.toLowerCase() !== username.toLowerCase() || !idRaw) continue;

    const time = block.match(/datetime="([^"]+)"/);
    const textMatch = block.match(/tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const date = time ? new Date(time[1]) : new Date();
    if (Number.isNaN(date.getTime())) continue;

    out.push({
      messageId: Number(idRaw),
      text: decodeEntities(textMatch?.[1] ?? ""),
      date,
    });
  }

  return out.sort((a, b) => a.messageId - b.messageId);
}

export async function collectTelegramWeb(): Promise<{ collected: number; duplicates: number; failed: number }> {
  const sources = await prisma.telegramSource.findMany({
    where: { enabled: true, username: { not: null } },
  });

  let collected = 0;
  let duplicates = 0;
  let failed = 0;

  for (const source of sources) {
    if (!source.username) continue;
    if (source.sourceType === "private_channel") continue;
    try {
      const response = await fetch(`https://t.me/s/${source.username}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      const messages = parseTelegramPreview(html, source.username);
      let created = 0;
      let dupes = 0;
      let maxId = source.lastProcessedMessageId;

      for (const message of messages) {
        if (message.messageId <= source.lastProcessedMessageId) continue;
        const result = await storeTelegramMessage(source, {
          messageId: message.messageId,
          text: message.text,
          date: message.date,
          mediaType: null,
          mediaMetadata: { adapter: "telegram-web" },
        });
        if (result === "created") created += 1;
        else dupes += 1;
        if (message.messageId > maxId) maxId = message.messageId;
      }

      if (maxId > source.lastProcessedMessageId) {
        await advanceCheckpoint(source.id, maxId);
      }

      collected += created;
      duplicates += dupes;
      logger.info(
        { source: source.name, fetched: messages.length, collected: created, duplicates: dupes },
        "telegram web fallback collected",
      );
    } catch (error) {
      failed += 1;
      logger.error({ err: error, source: source.name }, "telegram web fallback failed");
    }
  }

  return { collected, duplicates, failed };
}
