// OhAuthCat status page. Reads Upptime's data from this repository at view
// time (history/summary.json for current state and daily downtime, issues
// labelled "status" for incidents), so the page needs no rebuild when a
// check runs. It first draws the last known state (snapshot.js, written when
// the page is published, or the visitor's own cached copy if newer), so no
// row ever flashes an unknown state while the live data loads.
"use strict";

const { dayKey, dayState: coreDayState, uptimePercent, parseStartTime, pickSnapshot } = window.OhcStatus;

const REPO = "ohauthcat/status";
// A local preview (localhost) reads the sample data in ../preview instead.
const PREVIEW = location.hostname === "localhost";
const SUMMARY_URL = PREVIEW ? "../preview/summary.json" : `https://raw.githubusercontent.com/${REPO}/main/history/summary.json`;
const ISSUES_URL = PREVIEW ? "../preview/issues.json" : `https://api.github.com/repos/${REPO}/issues?state=all&labels=status&per_page=100`;
const HISTORY_YML = (slug) => PREVIEW ? null : `https://raw.githubusercontent.com/${REPO}/main/history/${slug}.yml`;
const CACHE_KEY = "ohauthcat.status.last";
const DAYS = 90;
const HISTORY_DAYS = 14;
// Days before production monitoring began show as "No data".
const MONITORING_START = PREVIEW ? "2026-08-01" : "2026-11-03";

const GROUPS = [
  { name: "Sign-in", items: [
    { slug: "sign-in", name: "Sign-in (SAML and OIDC)", host: "auth.ohauthcat.com" },
    { slug: "hosted-sign-in", name: "Hosted sign-in pages", host: "signin.ohauthcat.com" },
  ] },
  { name: "Directory sync", items: [
    { slug: "scim", name: "SCIM", host: "scim.ohauthcat.com" },
  ] },
  { name: "Developers", items: [
    { slug: "management-api", name: "Management API", host: "api.ohauthcat.com" },
    { slug: "dashboard", name: "Dashboard", host: "console.ohauthcat.com" },
  ] },
  { name: "Customer setup", items: [
    { slug: "setup-portal", name: "Setup portal", host: "connect.ohauthcat.com" },
  ] },
];

const STATE_TEXT = {
  ok: "Operational",
  partial: "Degraded",
  major: "Outage",
  none: "Not live yet",
};

const $ = (id) => document.getElementById(id);

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) if (child) node.append(child);
  return node;
}

function lastDays(count) {
  const out = [];
  const today = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() - i));
    out.push(dayKey(d));
  }
  return out;
}

function formatDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
  });
}

function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZoneName: "short",
  });
}

function minutesText(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// First check day per site slug (from history/<slug>.yml startTime).
let SINCE = {};

function dayState(key, site) {
  return coreDayState(key, site, SINCE[site ? site.slug : ""] || null, MONITORING_START, dayKey(new Date()));
}

function currentState(site) {
  if (!site) return "none";
  if (site.status === "down") return "major";
  if (site.status === "degraded") return "partial";
  return "ok";
}

// Upptime titles incidents "🛑 Sign-in is down"; drop the emoji.
function cleanTitle(title) {
  return title.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

function incidentState(issue) {
  if (issue.state === "closed") return "resolved";
  return /degraded/i.test(issue.title) ? "partial" : "major";
}

// Only a GitHub issue URL becomes a link; anything else stays plain text.
function safeIssueUrl(url) {
  return typeof url === "string" && url.startsWith("https://github.com/") ? url : null;
}

function incidentLink(issue) {
  const text = cleanTitle(String(issue.title || ""));
  const href = safeIssueUrl(issue.html_url);
  return href ? el("a", { href, text }) : el("span", { text });
}

function incidentNode(issue) {
  const state = incidentState(issue);
  const meta = issue.state === "closed"
    ? `Resolved ${formatTime(issue.closed_at)}. Lasted ${minutesText(Math.max(1, Math.round((new Date(issue.closed_at) - new Date(issue.created_at)) / 60000)))}.`
    : `Investigating since ${formatTime(issue.created_at)}.`;
  return el("li", { class: "incident", dataset: { state } }, [
    el("div", { class: "incident-title" }, incidentLink(issue)),
    el("p", { class: "incident-meta mono", text: meta }),
  ]);
}

// The hero: headline, the "updated" stamp and the live panel. `at` is when
// the data shown was read.
function renderHero(sites, openIssues, at = new Date()) {
  const monitored = sites.length > 0;
  const components = GROUPS.flatMap((g) => g.items);
  const states = components.map((c) => currentState(sites.find((s) => s.slug === c.slug)));
  let state = "ok";
  let headline = "All systems operational.";
  let lede = "Sign-in, directory sync, the management API, the dashboard and the setup portal are all working normally.";
  let pill = "All operational";
  let foot = "Every check passed";
  if (!monitored) {
    state = "none";
    headline = "Monitoring starts at launch.";
    lede = "OhAuthCat's production services are not live yet. From launch, every service is checked every 5 minutes and its history shows here.";
    pill = "Not live yet";
    foot = "Checks start at launch";
  } else if (states.includes("major") || openIssues.some((i) => incidentState(i) === "major")) {
    state = "major";
    headline = "Some systems are down.";
    lede = "We know and we're working on it. The details and updates are under Active incidents below.";
    pill = "Outage";
    const n = states.filter((x) => x === "major").length;
    foot = n === 1 ? "1 service down" : `${n} services down`;
  } else if (states.includes("partial") || openIssues.length) {
    state = "partial";
    headline = "Some systems are degraded.";
    lede = "Everything is reachable, but some requests are slower or failing. The details are under Active incidents below.";
    pill = "Degraded";
    const n = states.filter((x) => x === "partial").length || 1;
    foot = n === 1 ? "1 service degraded" : `${n} services degraded`;
  }
  $("headline").textContent = headline;
  $("lede").textContent = lede;
  const updated = $("updated");
  const sameDay = at.toDateString() === new Date().toDateString();
  updated.textContent = `Updated ${sameDay
    ? at.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", timeZoneName: "short" })
    : formatTime(at.toISOString())}`;
  updated.title = at.toISOString().replace(/\.\d{3}Z$/, "Z");
  const pillNode = $("panel-pill");
  pillNode.dataset.state = state;
  pillNode.textContent = pill;
  const footNode = $("panel-foot");
  footNode.dataset.state = state;
  $("foot-left").textContent = foot;
  $("foot-right").textContent = monitored ? "every 5 min" : "";
  $("now-rows").replaceChildren(...components.map((c, i) => {
    const s = states[i];
    return el("li", { class: "row", dataset: { state: s } }, [
      el("span", { class: "mark", "aria-hidden": "true" }),
      el("span", { class: "name" }, [document.createTextNode(c.name), el("small", { text: c.host })]),
      el("span", { class: "state", text: STATE_TEXT[s] }),
    ]);
  }));
}

function renderActive(openIssues) {
  const section = $("active");
  const list = $("active-list");
  list.replaceChildren(...openIssues.map(incidentNode));
  section.hidden = openIssues.length === 0;
}

function renderComponents(sites, issues, loading = false) {
  const today = dayKey(new Date());
  const days = lastDays(DAYS);
  const groups = GROUPS.map((group) => el("div", { class: "group" }, [
    el("h3", { class: "group-name mono", text: group.name }),
    ...group.items.map((component) => {
      const site = sites.find((s) => s.slug === component.slug);
      const state = currentState(site);
      const pct = uptimePercent(days, site, SINCE[component.slug] || null, MONITORING_START, today);
      const pct30 = uptimePercent(days.slice(-30), site, SINCE[component.slug] || null, MONITORING_START, today);
      const label = (p) => (loading ? "Loading" : p === null ? "No data yet" : `${p.toFixed(2)}% uptime`);
      const uptime = label(pct);
      const bars = el("div", {
        class: "bars",
        role: "img",
        "aria-label": `${component.name}: ${uptime} over the past ${DAYS} days`,
      }, days.map((d) => el("span", {
        class: "bar",
        dataset: { state: loading ? "none" : dayState(d, site), day: d, slug: component.slug },
      })));
      return el("div", { class: "component" }, [
        el("div", { class: "component-head" }, [
          el("div", { class: "component-name" }, [
            document.createTextNode(component.name),
            el("small", { class: "mono", text: component.host }),
          ]),
          el("span", { class: "pill", dataset: { state: loading ? "none" : state }, text: loading ? "Loading" : STATE_TEXT[state] }),
        ]),
        bars,
        el("div", { class: "bars-foot mono" }, [
          el("span", {}, [el("span", { class: "from-90", text: `${DAYS} days ago` }), el("span", { class: "from-30", text: "30 days ago" })]),
          el("span", { class: "rule" }),
          // Narrow screens show only the last 30 bars, so the figure matches.
          el("span", { class: "pct" }, [el("span", { class: "from-90", text: uptime }), el("span", { class: "from-30", text: label(pct30) })]),
          el("span", { class: "rule" }),
          el("span", { text: "Today" }),
        ]),
      ]);
    }),
  ]));
  $("groups").replaceChildren(...groups);
  wireTooltips(issues);
}

function renderHistory(issues) {
  const days = lastDays(HISTORY_DAYS).reverse();
  const byDay = new Map();
  for (const issue of issues) {
    const key = dayKey(new Date(issue.created_at));
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(issue);
  }
  // Runs of quiet days collapse into one row, newest first.
  const rows = [];
  let quiet = [];
  const flush = () => {
    if (!quiet.length) return;
    const label = quiet.length === 1
      ? formatDay(quiet[0])
      : `${formatDay(quiet[quiet.length - 1]).replace(/,? \d{4}$/, "")} – ${formatDay(quiet[0])}`;
    rows.push(el("li", { class: "day" }, [
      el("h3", { class: "day-date mono", text: label }),
      el("p", { class: "day-empty", text: "No incidents reported." }),
    ]));
    quiet = [];
  };
  for (const d of days) {
    const dayIssues = byDay.get(d) || [];
    if (!dayIssues.length) { quiet.push(d); continue; }
    flush();
    rows.push(el("li", { class: "day" }, [
      el("h3", { class: "day-date mono", text: formatDay(d) }),
      el("ol", { class: "incidents" }, dayIssues.map(incidentNode)),
    ]));
  }
  flush();
  $("history-list").replaceChildren(...rows);
}

function wireTooltips(issues) {
  const tip = $("tip");
  const show = (bar) => {
    const { day, slug, state } = bar.dataset;
    const site = window.__sites.find((s) => s.slug === slug);
    const minutes = site && site.dailyMinutesDown ? site.dailyMinutesDown[day] || 0 : 0;
    const lines = {
      ok: "No downtime recorded.",
      partial: `Down for ${minutesText(minutes)}.`,
      major: `Down for ${minutesText(minutes)}.`,
      none: "No data for this day.",
    };
    const dayIssues = issues.filter((i) => dayKey(new Date(i.created_at)) === day && i.labels.some((l) => l.name === slug));
    tip.replaceChildren(
      el("strong", { text: formatDay(day) }),
      document.createTextNode(lines[state]),
      ...dayIssues.map((i) => el("div", { text: cleanTitle(i.title) })),
    );
    tip.hidden = false;
    const r = bar.getBoundingClientRect();
    const w = tip.offsetWidth;
    const left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 8)}px`;
  };
  const hide = () => { tip.hidden = true; };
  document.querySelectorAll(".bar").forEach((bar) => {
    bar.addEventListener("mouseenter", () => show(bar));
    bar.addEventListener("mouseleave", hide);
  });
  window.addEventListener("scroll", hide, { passive: true });
}

// Only when no snapshot exists at all (snapshot.js missing and nothing
// cached): draw every block at its final size so nothing below moves when the
// real content replaces it.
function renderSkeleton() {
  $("now-rows").replaceChildren(...GROUPS.flatMap((g) => g.items).map((c) => el("li", { class: "row", dataset: { state: "none" } }, [
    el("span", { class: "mark", "aria-hidden": "true" }),
    el("span", { class: "name" }, [document.createTextNode(c.name), el("small", { text: c.host })]),
    el("span", { class: "state", text: "Loading" }),
  ])));
  renderComponents([], [], true);
  $("history-list").replaceChildren(el("li", { class: "day" }, [
    el("h3", { class: "day-date mono", text: "Past 14 days" }),
    el("p", { class: "day-empty", text: "Loading incidents" }),
  ]));
}

function render(sites, issues, at) {
  window.__sites = sites;
  const open = issues.filter((i) => i.state === "open");
  renderHero(sites, open, at);
  renderActive(open);
  renderComponents(sites, issues);
  renderHistory(issues);
}

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCache(snapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or blocked: the build-time snapshot still covers the next visit.
  }
}

// The first check day of each site, read live from history/<slug>.yml.
async function loadSince() {
  const slugs = GROUPS.flatMap((g) => g.items.map((c) => c.slug));
  const found = await Promise.all(slugs.map(async (slug) => {
    const url = HISTORY_YML(slug);
    if (!url) return [slug, null];
    try {
      const res = await fetch(`${url}?t=${Date.now()}`, { cache: "no-store" });
      return [slug, res.ok ? parseStartTime(await res.text()) : null];
    } catch {
      return [slug, null];
    }
  }));
  const since = {};
  for (const [slug, day] of found) if (day) since[slug] = day;
  return since;
}

// The data last drawn, so a failed refresh keeps showing it.
let LAST = null;

async function load() {
  let sites = null;
  let issues = null;
  try {
    const res = await fetch(`${SUMMARY_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    sites = Array.isArray(data) ? data : [];
  } catch {
    sites = null;
  }
  try {
    const res = await fetch(ISSUES_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) issues = data.filter((i) => !i.pull_request);
    }
  } catch {
    // GitHub's API unreachable or rate limited: keep the incidents last shown.
  }
  if (sites === null) {
    if (LAST) {
      // Keep the last known state on screen; its stamp says how old it is.
      if (issues !== null) render(LAST.sites, issues, LAST.at);
      return;
    }
    render([], issues || [], new Date());
    $("headline").textContent = "Status data could not be loaded.";
    $("lede").replaceChildren(
      document.createTextNode("Try again in a minute, or see the incidents on "),
      el("a", { href: `https://github.com/${REPO}/issues`, text: "GitHub" }),
      document.createTextNode("."),
    );
    return;
  }
  SINCE = { ...SINCE, ...(await loadSince()) };
  const finalIssues = issues !== null ? issues : LAST ? LAST.issues : [];
  const at = new Date();
  LAST = { sites, issues: finalIssues, at };
  writeCache({ at: at.toISOString(), sites, issues: finalIssues, since: SINCE });
  render(sites, finalIssues, at);
}

window.__sites = [];
const initial = pickSnapshot([window.__STATUS_SNAPSHOT, readCache()]);
if (initial) {
  SINCE = initial.since;
  LAST = { sites: initial.sites, issues: initial.issues, at: new Date(initial.at) };
  render(LAST.sites, LAST.issues, LAST.at);
} else {
  renderSkeleton();
}
load();
setInterval(load, 5 * 60 * 1000);
