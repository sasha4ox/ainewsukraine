import { Api } from "telegram";
import type { TelegramClient } from "telegram";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { connectUserClient, floodWaitSeconds, isSessionRevoked } from "./telegram-client.ts";
import { advanceCheckpoint, storeTelegramMessage } from "./store-telegram.ts";

function mediaInfo(message: Api.Message): { mediaType: string | null; mediaMetadata: Record<string, unknown> | null } {
  if (!message.media) return { mediaType: null, mediaMetadata: null };
  const className = message.media.className;
  return {
    mediaType: className,
    mediaMetadata: {
      className,
      hasPhoto: Boolean(message.photo),
      hasDocument: Boolean(message.document),
    },
  };
}

function inviteHash(inviteLink: string): string {
  const match = inviteLink.match(/\+([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`Cannot parse invite hash from ${inviteLink}`);
  return match[1];
}

async function resolveEntity(client: TelegramClient, username?: string | null, inviteLink?: string | null) {
  if (username) return client.getEntity(username);
  if (inviteLink) {
    const hash = inviteHash(inviteLink);
    try {
      const updates = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
      if (updates instanceof Api.ChatInviteAlready) return updates.chat;
    } catch {
      // fall through to import
    }
    const imported = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
    if (imported instanceof Api.Updates || imported instanceof Api.UpdatesCombined) {
      const chat = imported.chats[0];
      if (chat) return chat;
    }
  }
  throw new Error("Telegram source has neither username nor invite link");
}

export async function collectTelegram(): Promise<{
  collected: number;
  duplicates: number;
  failed: number;
  skipped: boolean;
  reason?: string;
}> {
  let client: TelegramClient | undefined;
  try {
    client = await connectUserClient();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    if (isSessionRevoked(error)) {
      logger.error({ err: error }, "telegram session revoked; regenerate with npm run tg:login");
    } else {
      logger.warn({ err: error }, "telegram mtproto unavailable");
    }
    return { collected: 0, duplicates: 0, failed: 0, skipped: true, reason };
  }

  let collected = 0;
  let duplicates = 0;
  let failed = 0;

  try {
    const sources = await prisma.telegramSource.findMany({ where: { enabled: true } });
    for (const source of sources) {
      try {
        const entity = await resolveEntity(client, source.username, source.inviteLink);
        const messages = await client.getMessages(entity, {
          limit: 80,
          minId: source.lastProcessedMessageId,
        });

        let maxId = source.lastProcessedMessageId;
        let created = 0;
        let dupes = 0;

        const chronological = [...messages].sort((a, b) => a.id - b.id);
        for (const message of chronological) {
          if (message.id <= source.lastProcessedMessageId) continue;
          const { mediaType, mediaMetadata } = mediaInfo(message as Api.Message);
          const result = await storeTelegramMessage(source, {
            messageId: message.id,
            text: message.message ?? "",
            date: new Date(message.date * 1000),
            mediaType,
            mediaMetadata,
          });
          if (result === "created") created += 1;
          else dupes += 1;
          if (message.id > maxId) maxId = message.id;
        }

        if (maxId > source.lastProcessedMessageId) {
          await advanceCheckpoint(source.id, maxId);
        }

        collected += created;
        duplicates += dupes;
        logger.info(
          {
            source: source.name,
            username: source.username,
            fetched: messages.length,
            collected: created,
            duplicates: dupes,
            checkpoint: maxId,
          },
          "telegram source collected",
        );
      } catch (error) {
        const wait = floodWaitSeconds(error);
        if (wait && wait <= 90) {
          logger.warn({ source: source.name, wait }, "telegram flood wait; sleeping");
          await new Promise((resolve) => setTimeout(resolve, (wait + 1) * 1000));
        }
        failed += 1;
        logger.error({ err: error, source: source.name }, "telegram source failed");
      }
    }
  } finally {
    await client.disconnect();
  }

  return { collected, duplicates, failed, skipped: false };
}
