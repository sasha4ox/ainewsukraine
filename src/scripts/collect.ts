import { collectRss } from "../collectors/rss.ts";
import { collectTelegram } from "../collectors/telegram.ts";
import { collectTelegramWeb } from "../collectors/telegram-web.ts";
import { loadEnv } from "../config/env.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";

// Prisma can reject a second promise with the same InvalidArg after the
// awaited create() has already thrown. That rejection happens after the
// collector finishes and would fail the GitHub job.
process.on("unhandledRejection", (reason) => {
  const code =
    typeof reason === "object" && reason && "code" in reason ? String((reason as { code: unknown }).code) : "";
  const message = reason instanceof Error ? reason.message : String(reason);
  if (code === "InvalidArg" || message.includes("unexpected end of hex escape")) {
    logger.error({ err: reason }, "ignored prisma string rejection");
    return;
  }
  logger.error({ err: reason }, "unhandled rejection");
  process.exitCode = 1;
});

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
