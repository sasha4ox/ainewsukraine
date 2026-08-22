import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTelegramClient, hasTelegramClientConfig } from "../collectors/telegram-client.ts";
import { loadEnv } from "../config/env.ts";

async function main() {
  loadEnv(true);
  if (!hasTelegramClientConfig()) {
    throw new Error("Set TELEGRAM_API_ID and TELEGRAM_API_HASH in .env first");
  }

  const rl = readline.createInterface({ input, output });
  const client = createTelegramClient(process.env.TELEGRAM_SESSION ?? "");

  await client.start({
    phoneNumber: async () => (await rl.question("Phone number in international format: ")).trim(),
    phoneCode: async () => (await rl.question("Code from Telegram: ")).trim(),
    password: async () => (await rl.question("2FA password (empty if none): ")).trim(),
    onError: (error) => console.error(error),
  });

  const session = String(client.session.save());
  console.log("\nAuthorized. Put this value into TELEGRAM_SESSION (local .env and GitHub Secrets):\n");
  console.log(session);
  console.log("\nDo not commit this value or any *.session file.");
  await client.disconnect();
  rl.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
