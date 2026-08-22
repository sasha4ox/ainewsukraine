import { loadEnv } from "../config/env.ts";
import { prisma } from "../db.ts";
import { digestWindow } from "../lib/dates.ts";
import { mapLimit } from "../lib/retry.ts";
import { logger } from "../logger.ts";
import { scoreCredibility } from "../pipeline/credibility.ts";
import { defaultDigestTitle, defaultFooter, formatDigest, writeDigestItems } from "../pipeline/digest.ts";
import { cheapEventPriority, groupEvents, loadUngroupedNews, type RawNewsWithSource } from "../pipeline/grouping.ts";
import { scoreImportance } from "../pipeline/importance.ts";
import { analyzeIndependence } from "../pipeline/independence.ts";
import { selectTopEvents, type EventForSelection } from "../pipeline/selection.ts";
import { publishDigest } from "../publish/telegram-bot.ts";

async function main() {
  const env = loadEnv();
  const { start, end, digestDate } = digestWindow(env.TIMEZONE);
  logger.info({ workflow: "daily-digest", start, end, digestDate, timezone: env.TIMEZONE }, "workflow start");

  const digest = await prisma.dailyDigest.upsert({
    where: { digestDate_digestType: { digestDate, digestType: "daily_top" } },
    update: {},
    create: {
      digestDate,
      digestType: "daily_top",
      status: "pending",
      timezone: env.TIMEZONE,
    },
  });

  if (digest.status === "published") {
    logger.info({ digestId: digest.id }, "digest already published; skipping");
    return;
  }

  if (digest.status === "generated" && digest.body) {
    logger.info({ digestId: digest.id }, "digest already generated; retrying publish");
    await publishAndMark(digest.id, digest.body);
    return;
  }

  const ungrouped = await loadUngroupedNews(start, end);
  const createdIds = await groupEvents(ungrouped, digestDate);
  logger.info({ created: createdIds.length, ungrouped: ungrouped.length }, "events created");

  const windowEvents = await prisma.event.findMany({
    where: { digestDate },
    include: {
      sources: {
        include: {
          rawNews: {
            include: {
              source: { select: { name: true, organization: true, isOfficial: true, reliabilityScore: true } },
              telegramSource: {
                select: {
                  name: true,
                  organization: true,
                  officialSourceId: true,
                  reliabilityScore: true,
                  sourceType: true,
                },
              },
            },
          },
        },
      },
    },
  });

  const ranked = [...windowEvents].sort((a, b) => {
    const aItems = a.sources.map((link) => link.rawNews as RawNewsWithSource);
    const bItems = b.sources.map((link) => link.rawNews as RawNewsWithSource);
    return cheapEventPriority(bItems) - cheapEventPriority(aItems);
  });
  const toScore = ranked.slice(0, env.MAX_EVENTS_TO_SCORE);
  logger.info({ created: windowEvents.length, scoring: toScore.length }, "capped AI scoring shortlist");

  await mapLimit(toScore, 3, async (row) => {
    const existing = await prisma.aiAnalysis.findFirst({
      where: { eventId: row.id, kind: "credibility" },
    });
    if (existing) return;
    const independence = await analyzeIndependence(row.id);
    const credibility = await scoreCredibility(row.id, independence);
    const importance = await scoreImportance(row.id);
    logger.info(
      { eventId: row.id, credibility: credibility.score, importance: importance.score, status: credibility.status },
      "event scored",
    );
  });

  const scored = (await prisma.event.findMany({
    where: { digestDate },
    include: { categories: { include: { category: true } } },
    orderBy: [{ importanceScore: "desc" }, { credibilityScore: "desc" }],
  })) as EventForSelection[];

  const selected = selectTopEvents(scored);
  if (selected.length === 0) {
    logger.warn("no events passed credibility/importance thresholds; nothing to publish");
    await prisma.dailyDigest.update({
      where: { id: digest.id },
      data: { status: "failed", itemCount: 0, headline: defaultDigestTitle(0) },
    });
    return;
  }

  const items = await writeDigestItems(selected);
  const title = defaultDigestTitle(items.length);
  const body = formatDigest(title, items, defaultFooter());

  await prisma.$transaction([
    prisma.digestItem.deleteMany({ where: { digestId: digest.id } }),
    ...items.map((item) =>
      prisma.digestItem.create({
        data: {
          digestId: digest.id,
          eventId: item.eventId,
          rank: item.rank,
          headline: item.headline,
          summary: item.summary,
        },
      }),
    ),
    prisma.dailyDigest.update({
      where: { id: digest.id },
      data: {
        status: "generated",
        headline: title,
        body,
        itemCount: items.length,
      },
    }),
  ]);

  logger.info({ count: items.length, title }, "digest generated");
  await publishAndMark(digest.id, body);
  logger.info({ workflow: "daily-digest" }, "workflow end");
}

async function publishAndMark(digestId: string, body: string) {
  try {
    await publishDigest(digestId, body);
    await prisma.dailyDigest.update({
      where: { id: digestId },
      data: { status: "published" },
    });
  } catch (error) {
    logger.error({ err: error, digestId }, "telegram publishing failed; digest stays generated");
    await prisma.telegramPost.create({
      data: {
        digestId,
        chatId: loadEnv().TELEGRAM_CHANNEL_ID ?? "unknown",
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

main()
  .catch((error) => {
    logger.error({ err: error }, "daily digest failed");
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
