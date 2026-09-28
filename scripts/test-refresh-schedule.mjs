import assert from "node:assert/strict";
import { nextRefreshAt, validTimeZone } from "../lib/refresh-schedule.ts";
let checks = 0;
function test(name, fn) {
  fn();
  checks++;
  console.log("PASS", name);
}
const run = (now, time, timeZone) =>
  nextRefreshAt(1440, { time, timeZone }, new Date(now)).toISOString();
test("Brasilia daily clock is independent of manual refresh time", () => {
  assert.equal(
    run("2026-09-28T09:20:00Z", "07:00", "America/Sao_Paulo"),
    "2026-09-28T10:00:00.000Z",
  );
  assert.equal(
    run("2026-09-28T10:00:00Z", "07:00", "America/Sao_Paulo"),
    "2026-09-29T10:00:00.000Z",
  );
  assert.equal(
    run("2026-09-28T14:33:00Z", "07:00", "America/Sao_Paulo"),
    "2026-09-29T10:00:00.000Z",
  );
});
test("UTC midnight and month rollover", () =>
  assert.equal(
    run("2026-12-31T23:59:59Z", "00:00", "UTC"),
    "2027-01-01T00:00:00.000Z",
  ));
test("non-hour offsets are respected", () =>
  assert.equal(
    run("2026-09-28T00:00:00Z", "07:00", "Asia/Kathmandu"),
    "2026-09-28T01:15:00.000Z",
  ));
test("DST missing clock time skips day and repeated time does not run twice", () => {
  assert.equal(
    run("2026-03-08T05:00:00Z", "02:30", "America/New_York"),
    "2026-03-09T06:30:00.000Z",
  );
  assert.equal(
    run("2026-11-01T05:30:00Z", "01:30", "America/New_York"),
    "2026-11-02T06:30:00.000Z",
  );
});
test("legacy interval schedules retain elapsed-time behavior", () => {
  const now = new Date("2026-09-28T03:41:23Z");
  assert.equal(
    nextRefreshAt(1440, undefined, now).toISOString(),
    "2026-09-29T03:41:23.000Z",
  );
  assert.equal(
    nextRefreshAt(15, { time: "07:00", timeZone: "UTC" }, now).toISOString(),
    "2026-09-28T03:56:23.000Z",
  );
});
test("invalid timezone, clock and interval fail before scheduling", () => {
  assert.equal(validTimeZone("Not/AZone"), false);
  assert.throws(() => run("2026-09-28T00:00:00Z", "24:00", "UTC"));
  assert.throws(() => run("2026-09-28T00:00:00Z", "07:00", "Not/AZone"));
  assert.throws(() => nextRefreshAt(1));
});
console.log(`${checks} schedule checks passed.`);
