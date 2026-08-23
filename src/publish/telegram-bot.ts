import { loadEnv } from "../config/env.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { withRetry } from "../lib/retry.ts";

const TELEGRAM_LIMIT = 4096;

export function splitTelegramText(text: string, limit = TELEGRAM_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > limit) {
    let cut = remaining.lastIndexOf("\n\n", limit);
    if (cut < limit * 0.5) cut = remaining.lastIndexOf("\n", limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining) parts.push(remaining);
  return parts;
}

type TelegramSendResult = { ok: boolean; result?: { message_id: number }; description?: string };

export function normalizeChannelId(raw: string): string {
  const value = raw.trim();
  const link = value.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)/i);
  if (link) return `@${link[1]}`;
  if (value.startsWith("@") || /^-?\d+$/.test(value)) return value;
  return value.startsWith("-") ? value : `@${value}`;
}

export async function publishDigest(digestId: string, body: string): Promise<number[]> {
  const env = loadEnv();
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHANNEL_ID) {
    throw new Error("TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required to publish");
  }
  const chatId = normalizeChannelId(env.TELEGRAM_CHANNEL_ID);

  const chunks = splitTelegramText(body);
  const messageIds: number[] = [];

  for (const chunk of chunks) {
    const sent = await withRetry(
      async () => {
        const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: chatId,
            text: chunk,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        });
        const payload = (await response.json()) as TelegramSendResult;
        if (!payload.ok || !payload.result) {
          throw new Error(payload.description ?? `Telegram sendMessage failed (${response.status})`);
        }
        return payload.result.message_id;
      },
      { attempts: 3, baseMs: 1000 },
    );
    messageIds.push(sent);
  }

  await prisma.telegramPost.create({
    data: {
      digestId,
      chatId,
      messageId: messageIds[0],
      status: "published",
      publishedAt: new Date(),
    },
  });

  logger.info({ digestId, messageIds, chunks: chunks.length }, "digest published to telegram");
  return messageIds;
}
