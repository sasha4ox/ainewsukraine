// GitHub's scheduler on this repo starts jobs hours late. Wake early, then
// sleep until DIGEST_TIME. If this slot is more than 90 minutes early, exit
// and let a later slot take it. Plain Node so this can run before npm ci.
import { appendFileSync } from "node:fs";

const MAX_WAIT_MINUTES = 90;
const timezone = process.env.TIMEZONE || "Europe/Kyiv";
const digestTime = process.env.DIGEST_TIME || "20:00";
const eventName = process.env.GITHUB_EVENT_NAME;

function minutesUntil(timeZone, hhmm) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date());
  const read = (type) => Number(parts.find((part) => part.type === type)?.value);
  const now = read("hour") * 60 + read("minute");
  return hour * 60 + minute - now;
}

function output(proceed) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `proceed=${proceed}\n`);
  }
  console.log(proceed ? "proceed" : "skip");
}

const early = eventName === "schedule" ? minutesUntil(timezone, digestTime) : 0;
if (eventName !== "schedule") {
  console.log("Manual run; posting now");
  output(true);
} else if (early === null) {
  console.log(`Unparsed DIGEST_TIME=${digestTime}; posting anyway`);
  output(true);
} else if (early > MAX_WAIT_MINUTES) {
  console.log(`${early} minutes until ${digestTime} ${timezone}; this slot is too early`);
  output(false);
} else if (early > 0) {
  console.log(`Waiting ${early} minutes until ${digestTime} ${timezone}`);
  await new Promise((resolve) => setTimeout(resolve, early * 60 * 1000));
  output(true);
} else {
  console.log(`Already ${-early} minutes past ${digestTime} ${timezone}; posting now`);
  output(true);
}
