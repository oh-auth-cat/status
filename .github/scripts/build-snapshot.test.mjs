// Run with: node --test .github/scripts/build-snapshot.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import { buildSnapshot, readSince, slimIssue } from "./build-snapshot.mjs";

function evaluate(text) {
  const sandbox = { window: {} };
  vm.runInNewContext(text, sandbox);
  return JSON.parse(JSON.stringify(sandbox.window.__STATUS_SNAPSHOT));
}

test("writes a script that sets the snapshot", () => {
  const snap = evaluate(buildSnapshot({
    sites: [{ slug: "scim", status: "up", dailyMinutesDown: {} }],
    since: { scim: "2026-11-15" },
    issues: [],
    now: new Date("2026-11-20T00:00:00Z"),
  }));
  assert.equal(snap.at, "2026-11-20T00:00:00.000Z");
  assert.equal(snap.sites[0].slug, "scim");
  assert.deepEqual(snap.since, { scim: "2026-11-15" });
});

test("escapes markup so a title cannot close the script tag", () => {
  const text = buildSnapshot({ sites: [], issues: [{ title: "</script><b>", created_at: "2026-11-20T00:00:00Z", state: "open" }] });
  assert.doesNotMatch(text, /<\/script>/);
  assert.equal(evaluate(text).issues[0].title, "</script><b>");
});

test("keeps only the incident fields the page reads and drops bad rows", () => {
  assert.equal(slimIssue(null), null);
  assert.equal(slimIssue({ title: "x", created_at: "t", pull_request: {} }), null);
  assert.equal(slimIssue({ created_at: "t" }), null);
  const slim = slimIssue({ title: "Down", state: "closed", created_at: "a", closed_at: "b", html_url: "u", labels: [{ name: "scim", id: 1 }, null], body: "secret", user: {} });
  assert.deepEqual(slim, { title: "Down", state: "closed", created_at: "a", closed_at: "b", html_url: "u", labels: [{ name: "scim" }] });
});

test("empty or missing inputs give an empty snapshot", () => {
  const snap = evaluate(buildSnapshot({ sites: null, since: null, issues: "x" }));
  assert.deepEqual([snap.sites, snap.since, snap.issues], [[], {}, []]);
});

test("reads each site's first check day from history yml files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "ohc-status-"));
  try {
    await writeFile(join(dir, "scim.yml"), "url: https://scim.example\nstartTime: 2026-11-15T09:00:00.000Z\n");
    await writeFile(join(dir, "dashboard.yml"), "url: https://console.example\n");
    await writeFile(join(dir, "summary.json"), "[]");
    assert.deepEqual(await readSince(dir), { scim: "2026-11-15" });
    assert.deepEqual(await readSince(join(dir, "missing")), {});
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
