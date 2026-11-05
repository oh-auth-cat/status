// Writes site/feed.xml, an Atom feed of the status incidents (issues labelled
// "status"), for the page's Subscribe links. GitHub does not serve issue lists
// as Atom, so the feed is built here whenever the site is published and
// whenever an incident is opened, edited, commented on or closed.
//
// Usage: GITHUB_TOKEN=... GITHUB_REPOSITORY=owner/repo node build-feed.mjs [out]
import { writeFile } from "node:fs/promises";

const SITE = "https://status.ohauthcat.com/";
const MAX_ENTRIES = 50;

export function escapeXml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Removes the leading status emoji Upptime puts in incident titles.
export function cleanTitle(title) {
  return String(title).replace(/^[^\p{L}\p{N}]+/u, "").trim() || "Incident";
}

export function entryFor(issue) {
  const updated = issue.closed_at ?? issue.updated_at ?? issue.created_at;
  const state = issue.state === "closed" ? "Resolved" : "Investigating";
  const summary = issue.state === "closed"
    ? `Resolved ${issue.closed_at}. Started ${issue.created_at}.`
    : `Investigating since ${issue.created_at}.`;
  return [
    "  <entry>",
    `    <id>${escapeXml(issue.html_url)}</id>`,
    `    <title>${escapeXml(`${state}: ${cleanTitle(issue.title)}`)}</title>`,
    `    <link rel="alternate" href="${escapeXml(issue.html_url)}"/>`,
    `    <published>${escapeXml(issue.created_at)}</published>`,
    `    <updated>${escapeXml(updated)}</updated>`,
    `    <summary>${escapeXml(summary)}</summary>`,
    "  </entry>",
  ].join("\n");
}

export function buildFeed(issues, now = new Date()) {
  const list = issues
    .filter((i) => i && typeof i.html_url === "string" && typeof i.created_at === "string" && !i.pull_request)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, MAX_ENTRIES);
  const updated = list.length > 0
    ? list.map((i) => i.closed_at ?? i.updated_at ?? i.created_at).sort().at(-1)
    : now.toISOString();
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${SITE}feed.xml</id>`,
    "  <title>OhAuthCat status: incidents</title>",
    `  <link rel="alternate" href="${SITE}"/>`,
    `  <link rel="self" href="${SITE}feed.xml"/>`,
    `  <updated>${escapeXml(updated)}</updated>`,
    "  <author><name>OhAuthCat</name></author>",
    ...list.map(entryFor),
    "</feed>",
    "",
  ].join("\n");
}

async function main() {
  const repo = process.env.GITHUB_REPOSITORY;
  const token = process.env.GITHUB_TOKEN;
  if (!repo) throw new Error("GITHUB_REPOSITORY is required");
  const out = process.argv[2] ?? "site/feed.xml";
  const res = await fetch(
    `https://api.github.com/repos/${repo}/issues?state=all&labels=status&per_page=100`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    },
  );
  if (!res.ok) throw new Error(`GitHub API answered ${res.status}`);
  const issues = await res.json();
  if (!Array.isArray(issues)) throw new Error("unexpected GitHub API response");
  await writeFile(out, buildFeed(issues));
  console.log(`wrote ${out} with ${Math.min(issues.length, MAX_ENTRIES)} incidents`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
