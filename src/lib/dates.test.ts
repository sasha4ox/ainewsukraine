import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import { isScheduledDigestDue, minutesUntilDigest } from "./dates.ts";

function kyiv(hour: number, minute: number, month = 1): DateTime {
  return DateTime.fromObject({ year: 2026, month, day: 15, hour, minute }, { zone: "Europe/Kyiv" });
}

test("20:00 Kyiv is due, and a late GitHub start still publishes", () => {
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", kyiv(20, 0), "schedule"), true);
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", kyiv(23, 10), "schedule"), true);
});

test("a runner that woke hours early does not publish yet", () => {
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", kyiv(18, 0), "schedule"), false);
  assert.equal(minutesUntilDigest("Europe/Kyiv", "20:00", kyiv(18, 30)), 90);
});

test("manual and local runs are not tied to 20:00", () => {
  const morning = kyiv(10, 0);
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", morning, "workflow_dispatch"), true);
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", morning, undefined), true);
});
