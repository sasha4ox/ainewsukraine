import { Api } from "telegram";
import { connectUserClient } from "../collectors/telegram-client.ts";
import { loadEnv } from "../config/env.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";

function inviteHash(inviteLink: string): string {
  const match = inviteLink.match(/\+([A-Za-z0-9_-]+)/);
  if (!match) throw new Error(`Cannot parse invite hash from ${inviteLink}`);
  return match[1];
}

async function main() {
  loadEnv();
  const client = await connectUserClient();
  const sources = await prisma.telegramSource.findMany({
    where: { enabled: true, inviteLink: { not: null } },
  });

  if (sources.length === 0) {
    logger.info("no invite-link telegram sources to join");
    await client.disconnect();
    return;
  }

  for (const source of sources) {
    if (!source.inviteLink) continue;
    const hash = inviteHash(source.inviteLink);
    try {
      const result = await client.invoke(new Api.messages.ImportChatInvite({ hash }));
      logger.info({ source: source.name, className: result.className }, "joined invite channel");
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (/USER_ALREADY_PARTICIPANT|already a participant/i.test(text)) {
        logger.info({ source: source.name }, "already a participant");
        continue;
      }
      logger.error({ err: error, source: source.name }, "failed to join invite channel");
    }
  }

  await client.disconnect();
}

main()
  .catch((error) => {
    logger.error({ err: error }, "tg:join failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
