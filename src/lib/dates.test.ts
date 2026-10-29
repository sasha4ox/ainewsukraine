import assert from "node:assert/strict";
import { test } from "node:test";
import { DateTime } from "luxon";
import { isScheduledDigestDue } from "./dates.ts";

function kyiv(hour: number, minute: number, month = 1): DateTime {
  return DateTime.fromObject({ year: 2026, month, day: 15, hour, minute }, { zone: "Europe/Kyiv" });
}

test("20:07 Kyiv is due in both winter and summer", () => {
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", kyiv(20, 7, 1), "schedule"), true);
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", kyiv(20, 7, 7), "schedule"), true);
});

test("the other seasonal UTC slot is an hour off and does not publish", () => {
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", kyiv(19, 7), "schedule"), false);
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", kyiv(21, 7), "schedule"), false);
});

test("a delayed run still inside the window publishes", () => {
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", kyiv(20, 40), "schedule"), true);
});

test("manual and local runs are not tied to 20:00", () => {
  const morning = kyiv(10, 0);
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", morning, "workflow_dispatch"), true);
  assert.equal(isScheduledDigestDue("Europe/Kyiv", "20:00", morning, undefined), true);
});

test("winter and summer 20:07 Kyiv map to the workflow crons", () => {
  assert.equal(kyiv(20, 7, 1).toUTC().toFormat("m H"), "7 18");
  assert.equal(kyiv(20, 7, 7).toUTC().toFormat("m H"), "7 17");
});
