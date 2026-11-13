// Pure helpers for the status page, shared by the browser (window.OhcStatus)
// and the Node tests (module.exports). No DOM access here.
"use strict";

(function (root) {
  // A day with this many minutes down or more is a major outage.
  const MAJOR_MINUTES = 60;

  // YYYY-MM-DD in UTC, the key Upptime uses for daily downtime.
  function dayKey(date) {
    return date.toISOString().slice(0, 10);
  }

  // Upptime writes `startTime: 2026-11-20T10:05:00.000Z` into
  // history/<slug>.yml when a check first runs. Returns the day key, or null.
  function parseStartTime(yaml) {
    if (typeof yaml !== "string") return null;
    const match = yaml.match(/^startTime:\s*["']?(\d{4}-\d{2}-\d{2})T[^\s"']*["']?\s*$/m);
    if (!match) return null;
    const day = match[1];
    return Number.isNaN(Date.parse(`${day}T00:00:00Z`)) ? null : day;
  }

  // The first day with real check data for one site: the later of the
  // monitoring start and the site's own first check. Upptime records only
  // days with downtime, so a day without an entry counts as checked only
  // from that first check on. Without a known first check, only days with a
  // downtime entry and (when the site reports a status) today are real.
  //
  //   day:      YYYY-MM-DD
  //   site:     the site's row from history/summary.json, or undefined
  //   since:    the site's first check day, or null
  //   start:    the day production monitoring began
  //   today:    today's day key
  function dayState(day, site, since, start, today) {
    if (!site || day < start || day > today) return "none";
    const downtime = site.dailyMinutesDown && typeof site.dailyMinutesDown === "object" ? site.dailyMinutesDown : {};
    const recorded = Object.prototype.hasOwnProperty.call(downtime, day);
    const minutes = recorded ? Number(downtime[day]) || 0 : 0;
    const checked = recorded || (since ? day >= since : day === today);
    if (!checked) return "none";
    if (minutes >= MAJOR_MINUTES) return "major";
    if (minutes > 0) return "partial";
    return "ok";
  }

  // Uptime over the days that have real data, or null when there are none.
  function uptimePercent(days, site, since, start, today) {
    const tracked = days.filter((d) => dayState(d, site, since, start, today) !== "none");
    if (!tracked.length) return null;
    const downtime = (site && site.dailyMinutesDown) || {};
    const down = tracked.reduce((sum, d) => sum + Math.min(1440, Number(downtime[d]) || 0), 0);
    return 100 * (1 - down / (tracked.length * 1440));
  }

  function isSnapshot(value) {
    return Boolean(value) && typeof value === "object" && Array.isArray(value.sites) &&
      typeof value.at === "string" && !Number.isNaN(Date.parse(value.at));
  }

  // The newest valid snapshot of the candidates (build-time or cached).
  function pickSnapshot(candidates) {
    let best = null;
    for (const c of candidates) {
      if (!isSnapshot(c)) continue;
      if (!best || Date.parse(c.at) > Date.parse(best.at)) best = c;
    }
    if (!best) return null;
    return {
      at: best.at,
      sites: best.sites,
      issues: Array.isArray(best.issues) ? best.issues : [],
      since: best.since && typeof best.since === "object" ? best.since : {},
    };
  }

  const api = { MAJOR_MINUTES, dayKey, parseStartTime, dayState, uptimePercent, pickSnapshot };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.OhcStatus = api;
})(this);
