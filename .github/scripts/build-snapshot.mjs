// Writes site/snapshot.js: the last known status (history/summary.json, each
// site's first check day from history/<slug>.yml, and the incidents) so the
// status page draws real data on first paint instead of a loading state.
//
//   node .github/scripts/build-snapshot.mjs [out] [historyDir]
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseStartTime } = require("../../site/status-core.js");

// Only the incident fields the page reads.
export function slimIssue(issue) {
  if (!issue || typeof issue !== "object" || issue.pull_request) return null;
  if (typeof issue.title !== "string" || typeof issue.created_at !== "string") return null;
  return {
    title: issue.title,
    state: issue.state === "closed" ? "closed" : "open",
    created_at: issue.created_at,
    closed_at: typeof issue.closed_at === "string" ? issue.closed_at : null,
    html_url: typeof issue.html_url === "string" ? issue.html_url : null,
    labels: Array.isArray(issue.labels)
      ? issue.labels.filter((l) => l && typeof l.name === "string").map((l) => ({ name: l.name }))
      : [],
  };
}

export function buildSnapshot({ sites, since, issues, now = new Date() }) {
  const data = {
    at: now.toISOString(),
    sites: Array.isArray(sites) ? sites : [],
    since: since && typeof since === "object" ? since : {},
    issues: (Array.isArray(issues) ? issues : []).map(slimIssue).filter(Boolean),
  };
  // JSON inside a script: escape "<" so no value can close the tag.
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `// Generated when the page is published. Do not edit.\nwindow.__STATUS_SNAPSHOT = ${json};\n`;
}

export async function readSince(historyDir) {
  const since = {};
  let names = [];
  try {
    names = await readdir(historyDir);
  } catch {
    return since;
  }
  for (const name of names) {
    if (!name.endsWith(".yml")) continue;
    const day = parseStartTime(await readFile(join(historyDir, name), "utf8"));
    if (day) since[name.slice(0, -4)] = day;
  }
  return since;
}

async function fetchIssues() {
  const repo = process.env.GITHUB_REPOSITORY;
  if (!repo) return [];
  const token = process.env.GITHUB_TOKEN;
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/issues?state=all&labels=status&per_page=100`, {
      headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function main() {
  const out = process.argv[2] ?? "site/snapshot.js";
  const historyDir = process.argv[3] ?? "history";
  let sites = [];
  try {
    const parsed = JSON.parse(await readFile(join(historyDir, "summary.json"), "utf8"));
    sites = Array.isArray(parsed) ? parsed : [];
  } catch {
    sites = [];
  }
  const text = buildSnapshot({ sites, since: await readSince(historyDir), issues: await fetchIssues() });
  await writeFile(out, text);
  console.log(`wrote ${out} with ${sites.length} sites`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
