import type { Prisma, TelegramSource } from "@prisma/client";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { bodyHash, contentHash } from "../normalize/hash.ts";
import { firstSentence, sanitizeText, stripHtml, truncateText } from "../normalize/text.ts";

export type IncomingTelegramMessage = {
  messageId: number;
  text: string;
  date: Date;
  mediaType: string | null;
  mediaMetadata: Record<string, unknown> | null;
};

export async function storeTelegramMessage(
  source: TelegramSource,
  incoming: IncomingTelegramMessage,
): Promise<"created" | "duplicate" | "skipped"> {
  const text = sanitizeText(stripHtml(incoming.text ?? "")).trim();
  if (!text && !incoming.mediaType) return "duplicate";

  const url = source.username ? `https://t.me/${source.username}/${incoming.messageId}` : null;
  const title = firstSentence(text || source.name, 180);
  const externalId = String(incoming.messageId);
  const hash = contentHash({
    sourceKey: `tg:${source.id}`,
    title,
    body: text,
    externalId,
  });

  try {
    const raw = await prisma.rawNews.create({
      data: {
        title,
        summary: firstSentence(text || title),
        content: truncateText(text, 8000) || null,
        telegramSourceId: source.id,
        sourceType: source.sourceType === "official" ? "official_telegram" : "telegram",
        url,
        publishedAt: incoming.date,
        language: "uk",
        externalId,
        contentHash: hash,
        bodyHash: bodyHash(title, text),
      },
    });

    await prisma.telegramMessage.create({
      data: {
        telegramSourceId: source.id,
        messageId: incoming.messageId,
        text: text || null,
        date: incoming.date,
        mediaType: incoming.mediaType,
        mediaMetadata: (incoming.mediaMetadata ?? undefined) as Prisma.InputJsonValue | undefined,
        rawNewsId: raw.id,
      },
    });
    return "created";
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") return "duplicate";
    if (code === "InvalidArg") {
      logger.warn(
        { source: source.name, messageId: incoming.messageId },
        "skipped telegram message prisma refused to store",
      );
      return "skipped";
    }
    throw error;
  }
}

export async function advanceCheckpoint(sourceId: string, maxMessageId: number): Promise<void> {
  await prisma.telegramSource.update({
    where: { id: sourceId },
    data: { lastProcessedMessageId: maxMessageId },
  });
}
