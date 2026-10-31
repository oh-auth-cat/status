// OhAuthCat status page. Reads Upptime's data from this repository at view
// time (history/summary.json for current state and daily downtime, issues
// labelled "status" for incidents), so the page needs no rebuild when a
// check runs.
"use strict";

const REPO = "oh-auth-cat/status";
// A local preview (localhost) reads the sample data in ../preview instead.
const PREVIEW = location.hostname === "localhost";
const SUMMARY_URL = PREVIEW ? "../preview/summary.json" : `https://raw.githubusercontent.com/${REPO}/master/history/summary.json`;
const ISSUES_URL = PREVIEW ? "../preview/issues.json" : `https://api.github.com/repos/${REPO}/issues?state=all&labels=status&per_page=100`;
const DAYS = 90;
const HISTORY_DAYS = 14;
// Days before production monitoring began show as "No data".
const MONITORING_START = PREVIEW ? "2026-08-01" : "2026-11-03";
// A day with this many minutes down or more is a major outage.
const MAJOR_MINUTES = 60;

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
  none: "Not monitored yet",
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

// YYYY-MM-DD in UTC, the key Upptime uses for daily downtime.
function dayKey(date) {
  return date.toISOString().slice(0, 10);
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
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

function minutesText(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function dayState(key, downtime) {
  if (key < MONITORING_START || key > dayKey(new Date())) return "none";
  if (!downtime) return "none";
  const minutes = downtime[key] || 0;
  if (minutes >= MAJOR_MINUTES) return "major";
  if (minutes > 0) return "partial";
  return "ok";
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

function incidentNode(issue) {
  const state = incidentState(issue);
  const meta = issue.state === "closed"
    ? `Resolved ${formatTime(issue.closed_at)}. Lasted ${minutesText(Math.max(1, Math.round((new Date(issue.closed_at) - new Date(issue.created_at)) / 60000)))}.`
    : `Investigating since ${formatTime(issue.created_at)}.`;
  return el("li", { class: "incident", dataset: { state } }, [
    el("div", { class: "incident-title" }, el("a", { href: issue.html_url, text: cleanTitle(issue.title) })),
    el("p", { class: "incident-meta", text: meta }),
  ]);
}

function renderBanner(sites, openIssues) {
  const banner = $("banner");
  const monitored = sites.length > 0;
  const states = GROUPS.flatMap((g) => g.items).map((c) => currentState(sites.find((s) => s.slug === c.slug)));
  let state = "ok";
  let title = "All systems operational";
  let detail = "";
  if (!monitored) {
    state = "none";
    title = "Monitoring starts on launch day";
    detail = "OhAuthCat's production services go live on 3 November 2026. Uptime history begins then.";
  } else if (states.includes("major") || openIssues.some((i) => incidentState(i) === "major")) {
    state = "major";
    title = "Some systems are down";
    detail = "We're working on it. Details are under Active incidents.";
  } else if (states.includes("partial") || openIssues.length) {
    state = "partial";
    title = "Some systems are degraded";
    detail = "Details are under Active incidents.";
  }
  banner.dataset.state = state;
  $("banner-title").textContent = title;
  $("banner-detail").textContent = detail;
}

function renderActive(openIssues) {
  const section = $("active");
  const list = $("active-list");
  list.replaceChildren(...openIssues.map(incidentNode));
  section.hidden = openIssues.length === 0;
}

function renderComponents(sites, issues) {
  const days = lastDays(DAYS);
  const groups = GROUPS.map((group) => el("div", { class: "group" }, [
    el("h3", { class: "group-name", text: group.name }),
    ...group.items.map((component) => {
      const site = sites.find((s) => s.slug === component.slug);
      const downtime = site ? site.dailyMinutesDown || {} : null;
      const state = currentState(site);
      const tracked = days.filter((d) => dayState(d, downtime) !== "none");
      const down = tracked.reduce((sum, d) => sum + (downtime[d] || 0), 0);
      const uptime = tracked.length
        ? `${(100 * (1 - down / (tracked.length * 1440))).toFixed(2)}% uptime over ${DAYS} days`
        : "No data yet";
      const bars = el("div", {
        class: "bars",
        role: "img",
        "aria-label": `${component.name}: ${uptime} over the past ${DAYS} days`,
      }, days.map((d) => el("span", {
        class: "bar",
        dataset: { state: dayState(d, downtime), day: d, slug: component.slug },
      })));
      return el("div", { class: "component" }, [
        el("div", { class: "component-head" }, [
          el("div", { class: "component-name" }, [
            document.createTextNode(component.name),
            el("span", { class: "component-host", text: component.host }),
          ]),
          el("span", { class: "pill", dataset: { state }, text: STATE_TEXT[state] }),
        ]),
        bars,
        el("div", { class: "bars-foot" }, [
          el("span", { class: "from-90", text: `${DAYS} days ago` }),
          el("span", { class: "from-30", text: "30 days ago" }),
          el("span", { text: uptime }),
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
  $("history-list").replaceChildren(...days.map((d) => {
    const dayIssues = byDay.get(d) || [];
    return el("li", { class: "day" }, [
      el("h3", { class: "day-date", text: formatDay(d) }),
      dayIssues.length
        ? el("ol", { class: "incident-list" }, dayIssues.map(incidentNode))
        : el("p", { class: "day-empty", text: "No incidents reported." }),
    ]);
  }));
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

async function load() {
  let sites = [];
  let issues = [];
  let failed = false;
  try {
    const res = await fetch(`${SUMMARY_URL}?t=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    sites = Array.isArray(data) ? data : [];
  } catch {
    failed = true;
  }
  try {
    const res = await fetch(ISSUES_URL, { headers: { Accept: "application/vnd.github+json" } });
    if (res.ok) {
      const data = await res.json();
      issues = Array.isArray(data) ? data.filter((i) => !i.pull_request) : [];
    }
  } catch {
    // Incidents stay empty when GitHub's API is unreachable or rate limited.
  }
  window.__sites = sites;
  const open = issues.filter((i) => i.state === "open");
  if (failed) {
    $("banner").dataset.state = "none";
    $("banner-title").textContent = "Status data could not be loaded";
    $("banner-detail").replaceChildren(
      document.createTextNode("Try again in a minute, or see the incidents on "),
      el("a", { href: `https://github.com/${REPO}/issues`, text: "GitHub" }),
      document.createTextNode("."),
    );
  } else {
    renderBanner(sites, open);
  }
  renderActive(open);
  renderComponents(sites, issues);
  renderHistory(issues);
}

load();
setInterval(load, 5 * 60 * 1000);
