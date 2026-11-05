// Run with: node --test .github/scripts/build-feed.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFeed, cleanTitle, escapeXml } from "./build-feed.mjs";

const open = { title: "⚠️ SCIM has degraded performance", state: "open", created_at: "2026-10-31T09:00:00Z", closed_at: null, updated_at: "2026-10-31T09:05:00Z", html_url: "https://github.com/oh-auth-cat/status/issues/9" };
const closed = { title: "🛑 Sign-in is down", state: "closed", created_at: "2026-10-28T03:12:00Z", closed_at: "2026-10-28T04:05:00Z", html_url: "https://github.com/oh-auth-cat/status/issues/8" };

test("lists incidents newest first with their state", () => {
  const xml = buildFeed([closed, open]);
  assert.ok(xml.indexOf("issues/9") < xml.indexOf("issues/8"));
  assert.match(xml, /<title>Investigating: SCIM has degraded performance<\/title>/);
  assert.match(xml, /<title>Resolved: Sign-in is down<\/title>/);
  assert.match(xml, /<updated>2026-10-31T09:05:00Z<\/updated>/);
});

test("is a valid empty feed with no incidents", () => {
  const xml = buildFeed([], new Date("2026-11-05T00:00:00Z"));
  assert.match(xml, /<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
  assert.match(xml, /<updated>2026-11-05T00:00:00.000Z<\/updated>/);
  assert.doesNotMatch(xml, /<entry>/);
});

test("skips malformed rows and pull requests", () => {
  const xml = buildFeed([null, { title: "x" }, { ...open, pull_request: {} }]);
  assert.doesNotMatch(xml, /<entry>/);
});

test("escapes markup in titles", () => {
  assert.equal(escapeXml(`<a & "b">`), "&lt;a &amp; &quot;b&quot;&gt;");
  assert.equal(cleanTitle("🛑 "), "Incident");
});
