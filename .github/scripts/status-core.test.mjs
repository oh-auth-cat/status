// Run with: node --test .github/scripts/status-core.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { dayState, uptimePercent, parseStartTime, pickSnapshot } = require("../../site/status-core.js");

const START = "2026-11-03";
const TODAY = "2026-11-20";
const site = { slug: "scim", status: "up", dailyMinutesDown: { "2026-11-18": 12, "2026-11-19": 90 } };

test("a site with no check data has no history, not 100%", () => {
  assert.equal(dayState("2026-11-10", undefined, null, START, TODAY), "none");
  const empty = { slug: "scim", status: "up", dailyMinutesDown: {} };
  assert.equal(dayState("2026-11-10", empty, null, START, TODAY), "none");
  assert.equal(uptimePercent(["2026-11-10", "2026-11-11"], empty, null, START, TODAY), null);
});

test("without a first check day only recorded days and today are real", () => {
  assert.equal(dayState("2026-11-17", site, null, START, TODAY), "none");
  assert.equal(dayState("2026-11-18", site, null, START, TODAY), "partial");
  assert.equal(dayState("2026-11-19", site, null, START, TODAY), "major");
  assert.equal(dayState(TODAY, site, null, START, TODAY), "ok");
});

test("from the first check day on, a day without downtime is ok", () => {
  assert.equal(dayState("2026-11-14", site, "2026-11-15", START, TODAY), "none");
  assert.equal(dayState("2026-11-15", site, "2026-11-15", START, TODAY), "ok");
  const pct = uptimePercent(["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", TODAY], site, "2026-11-15", START, TODAY);
  assert.ok(Math.abs(pct - 100 * (1 - 102 / (6 * 1440))) < 1e-9);
});

test("days before monitoring began or in the future have no data", () => {
  assert.equal(dayState("2026-11-01", site, "2026-10-01", START, TODAY), "none");
  assert.equal(dayState("2026-11-21", site, "2026-10-01", START, TODAY), "none");
});

test("parses Upptime's startTime and rejects anything else", () => {
  assert.equal(parseStartTime("url: x\nstartTime: 2026-11-20T10:05:00.000Z\n"), "2026-11-20");
  assert.equal(parseStartTime("startTime: '2026-11-20T10:05:00Z'"), "2026-11-20");
  assert.equal(parseStartTime("lastUpdated: 2026-11-20T10:05:00Z"), null);
  assert.equal(parseStartTime(""), null);
  assert.equal(parseStartTime(undefined), null);
});

test("picks the newest valid snapshot", () => {
  const older = { at: "2026-11-19T00:00:00Z", sites: [site] };
  const newer = { at: "2026-11-20T00:00:00Z", sites: [], issues: [{ title: "x" }], since: { scim: "2026-11-15" } };
  const picked = pickSnapshot([older, newer, null, { at: "nope", sites: [] }, { at: "2026-12-01T00:00:00Z" }]);
  assert.equal(picked.at, newer.at);
  assert.deepEqual(picked.since, { scim: "2026-11-15" });
  assert.equal(picked.issues.length, 1);
  assert.deepEqual(pickSnapshot([older]).issues, []);
  assert.equal(pickSnapshot([undefined, "x"]), null);
});
