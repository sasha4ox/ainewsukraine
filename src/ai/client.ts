import OpenAI from "openai";
import type { z } from "zod";
import { loadEnv } from "../config/env.ts";
import { logger } from "../logger.ts";
import { withRetry } from "../lib/retry.ts";

let client: OpenAI | undefined;

export function getOpenAI(): OpenAI {
  const env = loadEnv();
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for the digest pipeline");
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return client;
}

export async function structuredComplete<T>(options: {
  name: string;
  model: "fast" | "smart";
  system: string;
  user: string;
  schema: Record<string, unknown>;
  zodSchema: z.ZodType<T>;
}): Promise<T> {
  const env = loadEnv();
  const model = options.model === "smart" ? env.OPENAI_MODEL_SMART : env.OPENAI_MODEL_FAST;
  const openai = getOpenAI();

  logger.info({ prompt: options.name, model }, "openai request");

  const completion = await withRetry(
    () =>
      openai.chat.completions.create({
        model,
        temperature: 0.2,
        messages: [
          { role: "system", content: options.system },
          { role: "user", content: options.user },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: options.name,
            strict: true,
            schema: options.schema,
          },
        },
      }),
    {
      attempts: 3,
      baseMs: 1000,
      retryOn: (error) => {
        const status = (error as { status?: number }).status;
        return status === 429 || status === 500 || status === 503 || !status;
      },
    },
  );

  const text = completion.choices[0]?.message?.content;
  if (!text) throw new Error(`Empty OpenAI response for ${options.name}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`OpenAI returned non-JSON for ${options.name}`);
  }

  const result = options.zodSchema.safeParse(parsed);
  if (!result.success) {
    logger.error({ prompt: options.name, issues: result.error.issues }, "openai schema validation failed");
    throw new Error(`OpenAI response failed Zod validation for ${options.name}`);
  }
  return result.data;
}
