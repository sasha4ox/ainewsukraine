import { config as loadDotenv } from "dotenv";
import { z } from "zod";

loadDotenv();

function emptyToUndefined<T extends Record<string, unknown>>(input: T): T {
  const out = { ...input };
  for (const [key, value] of Object.entries(out)) {
    if (value === "") delete out[key];
  }
  return out;
}

const optionalString = z
  .string()
  .optional()
  .transform((v) => (v && v.trim().length > 0 ? v.trim() : undefined));

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  OPENAI_API_KEY: optionalString,
  OPENAI_MODEL_FAST: z.string().default("gpt-4o-mini"),
  OPENAI_MODEL_SMART: z.string().default("gpt-4o"),
  TELEGRAM_API_ID: optionalString.transform((v) => (v ? Number(v) : undefined)),
  TELEGRAM_API_HASH: optionalString,
  TELEGRAM_SESSION: optionalString,
  TELEGRAM_BOT_TOKEN: optionalString,
  TELEGRAM_CHANNEL_ID: optionalString,
  TIMEZONE: z.string().default("Europe/Kyiv"),
  DIGEST_TIME: z.string().default("20:00"),
  DIGEST_NEWS_COUNT: z.coerce.number().int().min(1).max(15).default(10),
  MIN_CREDIBILITY_SCORE: z.coerce.number().int().min(0).max(100).default(60),
  MIN_IMPORTANCE_SCORE: z.coerce.number().int().min(0).max(100).default(40),
  MAX_PER_CATEGORY: z.coerce.number().int().min(1).max(10).default(3),
  MAX_EVENTS_TO_SCORE: z.coerce.number().int().min(5).max(80).default(40),
  MAX_AI_GROUPS: z.coerce.number().int().min(0).max(40).default(15),
  COPY_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.65),
  CLUSTER_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).default(0.28),
  CLUSTER_TIME_WINDOW_HOURS: z.coerce.number().min(1).max(72).default(18),
  TELEGRAM_WEB_FALLBACK: z
    .enum(["true", "false", "1", "0"])
    .optional()
    .transform((v) => v === "true" || v === "1"),
  LOG_LEVEL: z.string().default("info"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function loadEnv(partial = false): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(
    emptyToUndefined({
      ...process.env,
      ...(partial && !process.env.DATABASE_URL ? { DATABASE_URL: "postgresql://localhost:5432/news" } : {}),
    }),
  );
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}
