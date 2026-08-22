import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { loadEnv } from "../config/env.ts";
import { logger } from "../logger.ts";

export function hasTelegramClientConfig(): boolean {
  const env = loadEnv();
  return Boolean(env.TELEGRAM_API_ID && env.TELEGRAM_API_HASH);
}

export function hasTelegramSession(): boolean {
  const env = loadEnv();
  return Boolean(env.TELEGRAM_SESSION && env.TELEGRAM_SESSION.length > 20);
}

export function createTelegramClient(session = ""): TelegramClient {
  const env = loadEnv();
  if (!env.TELEGRAM_API_ID || !env.TELEGRAM_API_HASH) {
    throw new Error("TELEGRAM_API_ID and TELEGRAM_API_HASH are required for MTProto");
  }
  return new TelegramClient(new StringSession(session), env.TELEGRAM_API_ID, env.TELEGRAM_API_HASH, {
    connectionRetries: 5,
    floodSleepThreshold: 60,
    deviceModel: "ChomuNeUkrainskoyu",
    appVersion: "0.1.0",
  });
}

export function isSessionRevoked(error: unknown): boolean {
  const text = error instanceof Error ? `${error.name} ${error.message}` : String(error);
  return /AUTH_KEY_UNREGISTERED|SESSION_REVOKED|SESSION_EXPIRED|AUTH_KEY_INVALID|USER_DEACTIVATED/i.test(text);
}

export function floodWaitSeconds(error: unknown): number | null {
  const text = error instanceof Error ? error.message : String(error);
  const match = text.match(/FLOOD_WAIT[_:]?\s*(\d+)/i) ?? text.match(/wait of (\d+) seconds/i);
  return match ? Number(match[1]) : null;
}

export async function connectUserClient(): Promise<TelegramClient> {
  const env = loadEnv();
  if (!hasTelegramSession()) {
    throw new Error("TELEGRAM_SESSION is missing. Run npm run tg:login locally first.");
  }
  const client = createTelegramClient(env.TELEGRAM_SESSION);
  await client.connect();
  const authorized = await client.checkAuthorization();
  if (!authorized) {
    await client.disconnect();
    throw new Error("TELEGRAM_SESSION is not authorized. Run npm run tg:login again.");
  }
  logger.info("telegram mtproto connected");
  return client;
}
