import { structuredComplete } from "../ai/client.ts";
import { importancePrompt } from "../ai/prompts/importance.ts";
import { importanceSchema, jsonSchemas } from "../ai/schemas.ts";
import { prisma } from "../db.ts";
import { logger } from "../logger.ts";
import { sourceDisplayName, type RawNewsWithSource } from "./grouping.ts";

export async function scoreImportance(eventId: string): Promise<{ score: number; reason: string }> {
  const event = await prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: {
      categories: { include: { category: true } },
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

  const items = event.sources.map((link) => link.rawNews as RawNewsWithSource);
  let score = 40;
  let reason = "Otsinka za zmistom podii dlia ukrainskoi audytorii.";

  try {
    const ai = await structuredComplete({
      name: "importance",
      model: "fast",
      system: importancePrompt.system,
      user: importancePrompt.user({
        title: event.title,
        summary: event.normalizedSummary,
        location: event.location,
        category: event.categories[0]?.category.slug ?? "other",
        sources: items.map((item) => sourceDisplayName(item)),
      }),
      schema: jsonSchemas.importance.schema,
      zodSchema: importanceSchema,
    });
    score = Math.max(0, Math.min(100, Math.round(ai.score)));
    reason = ai.reason;
  } catch (error) {
    logger.warn({ err: error, eventId }, "importance AI failed; using default");
  }

  await prisma.event.update({
    where: { id: eventId },
    data: { importanceScore: score },
  });

  await prisma.aiAnalysis.create({
    data: {
      eventId,
      kind: "importance",
      model: "pipeline",
      promptName: "importance",
      input: { title: event.title },
      output: { score, reason },
    },
  });

  return { score, reason };
}
