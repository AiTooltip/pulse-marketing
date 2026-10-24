/**
 * Browser-safe analysis helpers: channel timeline, video results, and how the
 * channel moved around each upload. Everything here describes association, never
 * proof that a video caused a change.
 */
const DAY = 86400000;
const ms = (d) => Date.parse(`${d}T12:00:00Z`);
export const daysBetween = (a, b) => Math.round((ms(b) - ms(a)) / DAY);
export const addDaysTo = (date, n) =>
  new Date(ms(date) + n * DAY).toISOString().slice(0, 10);
export const uploadDate = (post) => post.executedAt || post.date;
export const measureKey = (kpiId, periodDays = 0) => `${kpiId}|${periodDays || 0}`;
export const splitKey = (key) => {
  const [kpiId, days] = key.split("|");
  return { kpiId, periodDays: Number(days) || 0 };
};

const isAccountLevel = (m) => !m.postId && !m.strategyId;

function measuresFrom(state, accountId, pick) {
  const account = state.accounts.find((a) => a.id === accountId);
  const seen = new Map();
  for (const m of state.metrics) {
    if (m.accountId !== accountId || !pick(m)) continue;
    const kpi = account?.kpis.find((k) => k.id === m.kpiId);
    if (!kpi) continue;
    const key = measureKey(m.kpiId, m.periodDays);
    const e = seen.get(key) || {
      key,
      kpiId: m.kpiId,
      periodDays: m.periodDays || 0,
      kpi,
      count: 0,
    };
    e.count += 1;
    seen.set(key, e);
  }
  return [...seen.values()].sort(
    (a, b) => a.kpi.name.localeCompare(b.kpi.name) || a.periodDays - b.periodDays,
  );
}
/** Whole-account measures that have numbers (e.g. channel views per week). */
export const channelMeasures = (state, accountId) =>
  measuresFrom(state, accountId, isAccountLevel);
/** Per-video measures that have numbers (e.g. views in the first 7 days). */
export const videoMeasures = (state, accountId) =>
  measuresFrom(state, accountId, (m) => m.postId);

export function channelSeries(state, accountId, kpiId, periodDays = 0) {
  const byDate = new Map();
  for (const m of state.metrics)
    if (
      m.accountId === accountId &&
      m.kpiId === kpiId &&
      isAccountLevel(m) &&
      (m.periodDays || 0) === (periodDays || 0)
    )
      byDate.set(m.date, m.value);
  return [...byDate.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Turn a channel series into non-overlapping intervals with one comparable value each. */
export function intervalsOf(series, periodDays = 0) {
  if (periodDays > 0)
    return series.map((p) => ({
      start: addDaysTo(p.date, -(periodDays - 1)),
      end: p.date,
      value: p.value,
    }));
  // Running totals: gain per week between consecutive snapshots.
  const out = [];
  for (let i = 1; i < series.length; i++) {
    const days = daysBetween(series[i - 1].date, series[i].date);
    if (days > 0)
      out.push({
        start: addDaysTo(series[i - 1].date, 1),
        end: series[i].date,
        value: ((series[i].value - series[i - 1].value) / days) * 7,
      });
  }
  return out;
}

const avg = (l) => l.reduce((n, x) => n + x.value, 0) / l.length;

/**
 * Channel before vs after an upload. Only periods fully before / fully after the
 * upload day are used, so the period the video landed in is left out.
 */
export function effectOnChannel(state, post, accountId, measure, k = 2) {
  const { kpiId, periodDays } = measure;
  const ints = intervalsOf(
    channelSeries(state, accountId, kpiId, periodDays),
    periodDays,
  );
  const up = uploadDate(post);
  const before = ints.filter((i) => i.end < up).slice(-k);
  const after = ints.filter((i) => i.start >= up).slice(0, k);
  if (!before.length || !after.length)
    return {
      ok: false,
      reason: !before.length
        ? "No channel numbers fully before the upload."
        : "No channel numbers fully after the upload yet.",
    };
  const b = avg(before);
  const a = avg(after);
  const lastEnd = after.at(-1).end;
  const overlaps = state.posts.filter(
    (p) =>
      p.id !== post.id &&
      p.accountId === post.accountId &&
      uploadDate(p) > up &&
      uploadDate(p) <= lastEnd,
  ).length;
  return {
    ok: true,
    before,
    after,
    beforeAvg: b,
    afterAvg: a,
    change: a - b,
    pct: b !== 0 ? ((a - b) / Math.abs(b)) * 100 : null,
    overlaps,
    unitNote: periodDays > 0 ? "per period" : "gain per week",
  };
}

/** Videos (posts with numbers) for an account in a time window, with each measure's latest value. */
export function videoRows(state, { accountId, from, to, strategyId, measures }) {
  return state.posts
    .filter((p) => p.accountId === accountId && p.status !== "cancelled")
    .filter((p) => {
      const d = uploadDate(p);
      return (!from || d >= from) && (!to || d <= to);
    })
    .filter((p) =>
      strategyId === "none"
        ? !p.strategyId
        : !strategyId || p.strategyId === strategyId,
    )
    .map((post) => {
      const values = {};
      for (const m of state.metrics) {
        if (m.postId !== post.id) continue;
        const key = measureKey(m.kpiId, m.periodDays);
        if (!values[key] || values[key].date <= m.date)
          values[key] = { value: m.value, date: m.date };
      }
      return { post, upload: uploadDate(post), values };
    })
    .sort((a, b) => a.upload.localeCompare(b.upload));
}

export const median = (nums) => {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

/** Typical = within 25% of the median of your own videos. Needs 3+ videos to judge. */
export function judge(value, allValues, direction = "increase") {
  if (value === undefined || allValues.length < 3) return { label: "not enough videos to judge", tone: "neutral" };
  const med = median(allValues);
  if (!med) return { label: "typical", tone: "neutral", vsMedian: null };
  const ratio = value / med;
  const up = direction === "decrease" ? ratio <= 0.75 : ratio >= 1.25;
  const down = direction === "decrease" ? ratio >= 1.25 : ratio <= 0.75;
  return {
    label: up ? "above typical" : down ? "below typical" : "typical",
    tone: up ? "green" : down ? "red" : "neutral",
    vsMedian: (ratio - 1) * 100,
  };
}

export function strategyGroups(rows, measureKeyStr, strategies) {
  const groups = new Map();
  for (const r of rows) {
    const v = r.values[measureKeyStr]?.value;
    if (v === undefined) continue;
    const id = r.post.strategyId || "none";
    const g = groups.get(id) || {
      id,
      name:
        id === "none"
          ? "No strategy"
          : strategies.find((s) => s.id === id)?.name || "Unknown",
      values: [],
      best: null,
    };
    g.values.push(v);
    if (!g.best || v > g.best.value) g.best = { value: v, title: r.post.title };
    groups.set(id, g);
  }
  return [...groups.values()].map((g) => ({
    ...g,
    n: g.values.length,
    avg: g.values.reduce((a, b) => a + b, 0) / g.values.length,
    median: median(g.values),
  }));
}

/** Channel + upload summary for one date range. */
export function periodSummary(state, { accountId, from, to, channel, video }) {
  const series = channelSeries(state, accountId, channel.kpiId, channel.periodDays);
  const inRange = series.filter((p) => p.date >= from && p.date <= to);
  let channelValue = null;
  let channelNote = "";
  if (channel.periodDays > 0) {
    if (inRange.length) {
      channelValue = avg(inRange);
      channelNote = `average of ${inRange.length} period${inRange.length === 1 ? "" : "s"}`;
    }
  } else if (inRange.length >= 2) {
    const gain = inRange.at(-1).value - inRange[0].value;
    const days = daysBetween(inRange[0].date, inRange.at(-1).date);
    channelValue = days > 0 ? (gain / days) * 7 : null;
    channelNote = "gain per week";
  }
  const rows = videoRows(state, { accountId, from, to });
  const vs = rows
    .map((r) => r.values[video]?.value)
    .filter((v) => v !== undefined);
  return {
    channelValue,
    channelNote,
    points: inRange.length,
    uploads: rows.length,
    videoAvg: vs.length ? vs.reduce((a, b) => a + b, 0) / vs.length : null,
    videosMeasured: vs.length,
  };
}

/* ---------------- Tactics and theories ---------------- */
export const EMERGING_AFTER = 3;
export const PROVEN_AFTER = 5;
export const PROVEN_RATE = 0.8;

const betterThan = (a, b, direction) => (direction === "decrease" ? a < b : a > b);

/**
 * A "theory" per tactic: do videos that used it beat videos that didn't, on one
 * measure? Each measured video using the tactic is one test, judged against the
 * median of measured videos without it. Proven needs 5 tests and 80% beating the
 * baseline; it describes association, not proof of cause.
 */
export function tacticTheories(state, { accountId, measure, direction = "increase", from, to, includeUnused = false }) {
  const rows = videoRows(state, { accountId, from, to }).filter((r) => r.values[measure]);
  const out = [];
  for (const tactic of state.tactics || []) {
    const withT = rows.filter((r) => (r.post.tacticIds || []).includes(tactic.id));
    if (!withT.length && !includeUnused) continue;
    const without = rows.filter((r) => !(r.post.tacticIds || []).includes(tactic.id));
    const withVals = withT.map((r) => r.values[measure].value);
    const baseline = without.length >= 2 ? median(without.map((r) => r.values[measure].value)) : null;
    const tests = withT.length;
    const beat = baseline === null ? 0 : withVals.filter((v) => betterThan(v, baseline, direction)).length;
    const rate = tests ? beat / tests : 0;
    const withMedian = median(withVals);
    let status = "hypothesis";
    if (baseline === null) status = "no-baseline";
    else if (tests >= PROVEN_AFTER)
      status = rate >= PROVEN_RATE ? "proven" : rate >= 0.5 ? "mixed" : "not-holding";
    else if (tests >= EMERGING_AFTER) status = rate >= 0.5 ? "emerging" : "unlikely";
    const others = withT.length
      ? withT.reduce((n, r) => n + (r.post.tacticIds || []).filter((id) => id !== tactic.id).length, 0) / withT.length
      : 0;
    out.push({
      tactic,
      tests,
      beat,
      rate,
      withMedian,
      baseline,
      withoutCount: without.length,
      lift:
        baseline && withMedian !== null && baseline !== 0
          ? ((withMedian - baseline) / Math.abs(baseline)) * 100
          : null,
      status,
      moreNeeded: Math.max(0, PROVEN_AFTER - tests),
      otherTacticsAvg: others,
      videos: withT.map((r) => r.post.title),
      results: withT.map((r) => ({
        title: r.post.title,
        value: r.values[measure].value,
        beat: baseline !== null && betterThan(r.values[measure].value, baseline, direction),
      })),
    });
  }
  return out.sort(
    (a, b) =>
      (b.lift ?? -Infinity) * (direction === "decrease" ? -1 : 1) -
      (a.lift ?? -Infinity) * (direction === "decrease" ? -1 : 1),
  );
}

/** Videos with only A, only B, both, or neither of two tactics. */
export function headToHead(state, { accountId, measure, a, b, from, to }) {
  const rows = videoRows(state, { accountId, from, to }).filter((r) => r.values[measure]);
  const has = (r, id) => (r.post.tacticIds || []).includes(id);
  const groups = {
    onlyA: rows.filter((r) => has(r, a) && !has(r, b)),
    onlyB: rows.filter((r) => has(r, b) && !has(r, a)),
    both: rows.filter((r) => has(r, a) && has(r, b)),
    neither: rows.filter((r) => !has(r, a) && !has(r, b)),
  };
  return Object.fromEntries(
    Object.entries(groups).map(([k, list]) => {
      const vals = list.map((r) => r.values[measure].value);
      return [k, { n: list.length, median: median(vals), avg: vals.length ? vals.reduce((x, y) => x + y, 0) / vals.length : null, titles: list.map((r) => r.post.title) }];
    }),
  );
}

/* ---------------- Tracked theories (the testing workflow) ---------------- */
/**
 * A theory says: videos using this tactic beat the typical video on one measure.
 * Videos uploaded on/after `startedAt` are the deliberate tests. Older videos
 * with the tactic are shown as evidence only. Ready to prove = PROVEN_AFTER tests
 * with PROVEN_RATE beating the median of videos without the tactic.
 */
export function evaluateTheory(state, theory) {
  const measure = measureKey(theory.kpiId, theory.periodDays);
  const account = state.accounts.find((a) => a.id === theory.accountId);
  const direction = account?.kpis.find((k) => k.id === theory.kpiId)?.direction || "increase";
  const all = videoRows(state, { accountId: theory.accountId });
  const measured = all.filter((r) => r.values[measure]);
  const has = (r) => (r.post.tacticIds || []).includes(theory.tacticId);
  const withoutVals = measured.filter((r) => !has(r)).map((r) => r.values[measure].value);
  const baseline = withoutVals.length >= 2 ? median(withoutVals) : null;
  const judgeRow = (r) => ({
    title: r.post.title,
    upload: r.upload,
    value: r.values[measure].value,
    beat: baseline !== null && betterThan(r.values[measure].value, baseline, direction),
  });
  const withRows = measured.filter(has);
  const tests = withRows.filter((r) => r.upload >= theory.startedAt).map(judgeRow);
  const evidence = withRows.filter((r) => r.upload < theory.startedAt).map(judgeRow);
  const beat = tests.filter((t) => t.beat).length;
  const rate = tests.length ? beat / tests.length : 0;
  const awaiting = all.filter(
    (r) => has(r) && r.post.status === "executed" && r.upload >= theory.startedAt && !r.values[measure],
  ).length;
  const planned = state.posts.filter(
    (p) => p.accountId === theory.accountId && p.status === "planned" && (p.tacticIds || []).includes(theory.tacticId),
  ).length;
  let ready = "testing";
  if (baseline === null) ready = "no-baseline";
  else if (tests.length >= PROVEN_AFTER) ready = rate >= PROVEN_RATE ? "ready-proven" : rate < 0.5 ? "ready-disproven" : "inconclusive";
  return {
    measure,
    direction,
    baseline,
    tests,
    evidence,
    beat,
    rate,
    awaiting,
    planned,
    ready,
    moreNeeded: Math.max(0, PROVEN_AFTER - tests.length),
    evidenceBeat: evidence.filter((e) => e.beat).length,
  };
}

/* ---------------- Compare groups ---------------- */
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const GROUP_DIMENSIONS = [
  ["campaign", "Campaign"],
  ["strategy", "Strategy"],
  ["tactic", "Tactic"],
  ["format", "Content type"],
  ["month", "Month uploaded"],
  ["weekday", "Day of the week"],
];

/** Group videos by one dimension and summarise a measure. A video can sit in several tactic groups. */
export function groupVideos(state, rows, dimension, measure) {
  const groups = new Map();
  const put = (id, name, row) => {
    const v = row.values[measure]?.value;
    if (v === undefined) return;
    const g = groups.get(id) || { id, name, values: [], items: [] };
    g.values.push(v);
    g.items.push({ title: row.post.title, value: v });
    groups.set(id, g);
  };
  for (const r of rows) {
    const p = r.post;
    if (dimension === "campaign")
      put(p.campaignId || "none", p.campaignId ? state.campaigns.find((c) => c.id === p.campaignId)?.name || "Campaign" : "No campaign", r);
    else if (dimension === "strategy")
      put(p.strategyId || "none", p.strategyId ? state.strategies.find((s) => s.id === p.strategyId)?.name || "Strategy" : "No strategy", r);
    else if (dimension === "tactic") {
      const ids = p.tacticIds || [];
      if (!ids.length) put("none", "No tactic tagged", r);
      for (const id of ids) put(id, state.tactics.find((t) => t.id === id)?.name || "Tactic", r);
    } else if (dimension === "format") put(p.format || "Other", p.format || "Other", r);
    else if (dimension === "month") put(r.upload.slice(0, 7), r.upload.slice(0, 7), r);
    else if (dimension === "weekday") {
      const d = new Date(`${r.upload}T12:00:00Z`).getUTCDay();
      put(String(d), WEEKDAYS[d], r);
    }
  }
  return [...groups.values()].map((g) => {
    const best = g.items.reduce((a, b) => (b.value > a.value ? b : a));
    return {
      id: g.id,
      name: g.name,
      n: g.values.length,
      avg: g.values.reduce((a, b) => a + b, 0) / g.values.length,
      median: median(g.values),
      best,
      worst: g.items.reduce((a, b) => (b.value < a.value ? b : a)),
    };
  });
}

/* ---------------- Tactic lifecycle ---------------- */
export const TACTIC_STATUSES = [
  ["idea", "Idea", "Not tried yet"],
  ["testing", "Testing", "Being tried on videos"],
  ["promising", "Promising", "Early results look good"],
  ["proven", "Proven", "Passed the 5-test check"],
  ["adopted", "Adopted", "Your standard way of doing it"],
  ["paused", "Paused", "Not using it right now"],
];

/**
 * Where a tactic stands. A status you set yourself wins. Otherwise it follows the
 * evidence: proven theory, promising pattern, being tried, or just an idea.
 * "Adopted" is always your decision, kept separate from "Proven" (the evidence).
 */
export function tacticLifecycle(state, tactic) {
  if (tactic.status) return { status: tactic.status, auto: false, reason: "Set by you." };
  const theories = (state.theories || []).filter((t) => t.tacticId === tactic.id);
  if (theories.some((t) => t.status === "proven"))
    return { status: "proven", auto: true, reason: "A theory for it was proven." };
  const usedBy = state.posts.filter((p) => (p.tacticIds || []).includes(tactic.id));
  const accountIds = [...new Set(usedBy.map((p) => p.accountId))];
  for (const accountId of accountIds) {
    for (const m of videoMeasures(state, accountId)) {
      const account = state.accounts.find((a) => a.id === accountId);
      const direction = account?.kpis.find((k) => k.id === m.kpiId)?.direction || "increase";
      const th = tacticTheories(state, { accountId, measure: m.key, direction }).find((x) => x.tactic.id === tactic.id);
      if (th && (th.status === "proven" || th.status === "emerging") && th.lift !== null && (th.lift > 0) === (direction !== "decrease"))
        return { status: "promising", auto: true, reason: "Videos using it are beating the typical video." };
    }
  }
  const active = theories.filter((t) => t.status === "testing" || t.status === "paused");
  if (theories.some((t) => t.status === "disproven") && !active.length)
    return { status: "paused", auto: true, reason: "It did not hold up in testing." };
  if (active.length || usedBy.length)
    return { status: "testing", auto: true, reason: active.length ? "A theory is being tested." : "Used on videos, not tested yet." };
  return { status: "idea", auto: true, reason: "Not used on any video yet." };
}

/* ---------------- Growth overview ---------------- */
const mean = (l) => l.reduce((n, x) => n + x.value, 0) / l.length;

/**
 * How one whole-account measure moved over [from, to], and how that compares with
 * the equally long window just before it.
 * - Running totals (no periodDays): growth = last snapshot minus the first one
 *   in the window (a snapshot just before the window is used as the start when
 *   it is no more than one window old). Needs 2+ snapshots.
 * - Windowed measures (periodDays): compares the average period in the window
 *   with the average period in the previous window.
 * `pct` is the headline change; `prevPct` is the same figure for the previous window.
 */
export function measureTrend(state, { accountId, kpiId, periodDays = 0, from, to }) {
  const series = channelSeries(state, accountId, kpiId, periodDays);
  const len = daysBetween(from, to) + 1;
  const pFrom = addDaysTo(from, -len);
  const pTo = addDaysTo(from, -1);
  const cur = series.filter((p) => p.date >= from && p.date <= to);
  const prev = series.filter((p) => p.date >= pFrom && p.date <= pTo);
  const out = { series: cur, prevSeries: prev, len, pFrom, pTo, latest: cur.at(-1) || null, ok: false };
  if (!cur.length) return { ...out, reason: "No numbers in this period." };
  const pct = (a, b) => (b === null || b === undefined || b === 0 ? null : ((a - b) / Math.abs(b)) * 100);

  if (periodDays > 0) {
    let a = mean(cur);
    let b = prev.length ? mean(prev) : null;
    // No earlier window recorded: compare the later half of this window with its earlier half.
    let halves = false;
    if (b === null && cur.length >= 4) {
      const mid = Math.floor(cur.length / 2);
      b = mean(cur.slice(0, mid));
      a = mean(cur.slice(mid));
      halves = true;
    }
    const best = cur.reduce((x, y) => (y.value > x.value ? y : x));
    const worst = cur.reduce((x, y) => (y.value < x.value ? y : x));
    return {
      ...out,
      ok: true,
      kind: "window",
      halves,
      avg: halves ? mean(cur) : a,
      recentAvg: a,
      prevAvg: b,
      change: b === null ? null : a - b,
      pct: b === null ? null : pct(a, b),
      best,
      worst,
      total: cur.reduce((n, p) => n + p.value, 0),
      note: `average ${periodDays === 1 ? "per day" : periodDays === 7 ? "per week" : periodDays === 30 ? "per month" : `per ${periodDays} days`}`,
    };
  }
  const before = series.filter((p) => p.date < from).at(-1);
  const start = before && daysBetween(before.date, from) <= len ? before : cur[0];
  const end = cur.at(-1);
  if (start.date === end.date) return { ...out, reason: "Needs at least two snapshots in this period." };
  const gain = end.value - start.value;
  const days = daysBetween(start.date, end.date);
  const pEnd = start;
  const pStartCand = series.filter((p) => p.date < pEnd.date && p.date >= pFrom);
  const pStart = pStartCand[0] || series.filter((p) => p.date < pFrom).at(-1);
  const prevGain = pStart && pStart.date < pEnd.date ? pEnd.value - pStart.value : null;
  return {
    ...out,
    ok: true,
    kind: "total",
    start,
    end,
    gain,
    perWeek: days > 0 ? (gain / days) * 7 : null,
    pct: pct(end.value, start.value),
    prevGain,
    prevPct: pStart && pStart.date < pEnd.date ? pct(pEnd.value, pStart.value) : null,
    note: "growth in this period",
  };
}

/** Tone of a change given the KPI direction ("decrease" = lower is better). */
export const changeTone = (delta, direction = "increase", flat = 0.5) => {
  if (delta === null || delta === undefined || Math.abs(delta) < flat) return "neutral";
  return (delta > 0) === (direction !== "decrease") ? "green" : "red";
};
