import { collectRss } from "../collectors/rss.ts";
import { collectTelegram } from "../collectors/telegram.ts";
import { collectTelegramWeb } from "../collectors/telegram-web.ts";
import { loadEnv } from "../config/env.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";

async function main() {
  const env = loadEnv();
  logger.info({ workflow: "collect-news" }, "workflow start");

  const rss = await collectRss();
  logger.info(rss, "rss collection finished");

  const telegram = await collectTelegram();
  logger.info(telegram, "telegram mtproto collection finished");

  let web = { collected: 0, duplicates: 0, failed: 0 };
  if (env.TELEGRAM_WEB_FALLBACK && (telegram.skipped || telegram.failed > 0)) {
    web = await collectTelegramWeb();
    logger.info(web, "telegram web fallback finished");
  }

  logger.info(
    {
      workflow: "collect-news",
      rss,
      telegram,
      web,
      collected: rss.collected + telegram.collected + web.collected,
      duplicates: rss.duplicates + telegram.duplicates + web.duplicates,
    },
    "workflow end",
  );
}

main()
  .catch((error) => {
    logger.error({ err: error }, "collect failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
