import assert from "node:assert/strict";
import { test } from "node:test";
import { splitTelegramText } from "./telegram-bot.ts";

test("does not split short messages", () => {
  assert.deepEqual(splitTelegramText("hello", 20), ["hello"]);
});

test("splits long messages on paragraph boundaries", () => {
  const text = `${"a".repeat(30)}\n\n${"b".repeat(30)}`;
  const parts = splitTelegramText(text, 40);
  assert.ok(parts.length >= 2);
  assert.ok(parts.every((part) => part.length <= 40));
});
