import pino from "pino";

const redactPaths = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "TELEGRAM_API_HASH",
  "TELEGRAM_SESSION",
  "TELEGRAM_BOT_TOKEN",
  "*.apiKey",
  "*.api_key",
  "*.token",
  "*.session",
  "*.password",
  "headers.authorization",
];

const pretty = process.env.LOG_PRETTY === "true" || process.stdout.isTTY;

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: { paths: redactPaths, remove: true },
  ...(pretty
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {}),
});

export function childLogger(bindings: Record<string, unknown>) {
  return logger.child(bindings);
}
