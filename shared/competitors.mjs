/**
 * Browser-safe competitor benchmarking. Competitor numbers are snapshots someone
 * entered from public profiles (nothing is fetched), so they are estimates.
 */
import { today, addDays } from "./domain.mjs";

export const STALE_AFTER_DAYS = 30;
export const METRICS = [
  { key: "followers", label: "Audience", unit: "" },
  { key: "postsPerWeek", label: "Posts / week", unit: "" },
  { key: "engagementRate", label: "Engagement rate", unit: "%" },
];

const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const median = (values) => {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
};

export function platformsFor(state, clientId) {
  const ids = new Set(
    (state.competitors || []).filter((c) => c.clientId === clientId).map((c) => c.id),
  );
  const names = new Map();
  const add = (p) => p && !names.has(p.toLowerCase()) && names.set(p.toLowerCase(), p);
  for (const a of state.accounts || []) if (a.clientId === clientId) add(a.platform);
  for (const b of state.benchmarks || []) if (ids.has(b.competitorId)) add(b.platform);
  for (const c of state.competitors || [])
    if (c.clientId === clientId) for (const ch of c.channels || []) add(ch.platform);
  return [...names.values()];
}

/** Newest and previous benchmark snapshot of one competitor on one platform. */
export function snapshots(state, competitorId, platform) {
  const rows = (state.benchmarks || [])
    .filter((b) => b.competitorId === competitorId && same(b.platform, platform))
    .sort((a, b) => b.date.localeCompare(a.date));
  return { latest: rows[0] || null, previous: rows[1] || null, count: rows.length };
}

/** Newest matching observation per account, so two similar KPIs never double count. */
const latestMetric = (state, accounts, pattern) => {
  const found = [];
  for (const a of accounts) {
    const rows = (a.kpis || [])
      .filter((k) => pattern.test(k.name))
      .flatMap((k) =>
        (state.metrics || []).filter(
          (m) =>
            m.accountId === a.id &&
            m.kpiId === k.id &&
            !m.periodDays &&
            !m.postId &&
            !m.strategyId &&
            m.date <= today(),
        ),
      )
      .sort((x, y) => y.date.localeCompare(x.date));
    if (rows[0]) found.push(rows[0]);
  }
  return found;
};

/** The client's own numbers for a platform, taken from their tracked accounts and posts. */
export function ownMetrics(state, clientId, platform) {
  const accounts = (state.accounts || []).filter(
    (a) => a.clientId === clientId && same(a.platform, platform),
  );
  if (!accounts.length) return null;
  const followers = latestMetric(state, accounts, /follower|subscriber/i);
  const engagement = latestMetric(state, accounts, /engagement/i);
  const from = addDays(today(), -27);
  const ids = new Set(accounts.map((a) => a.id));
  const posted = (state.posts || []).filter(
    (p) => ids.has(p.accountId) && p.status === "executed" && p.date >= from && p.date <= today(),
  );
  return {
    followers: followers.length ? followers.reduce((n, m) => n + m.value, 0) : null,
    engagementRate: engagement.length
      ? engagement.reduce((n, m) => n + m.value, 0) / engagement.length
      : null,
    postsPerWeek: posted.length ? posted.length / 4 : null,
    date: [...followers, ...engagement].map((m) => m.date).sort().at(-1) || null,
  };
}

export function benchmarkTable(state, clientId, platform) {
  const competitors = (state.competitors || []).filter((c) => c.clientId === clientId);
  const rows = competitors.flatMap((competitor) => {
    const { latest, previous } = snapshots(state, competitor.id, platform);
    if (!latest) return [];
    const growthPct =
      previous && previous.followers > 0 && latest.followers !== undefined
        ? ((latest.followers - previous.followers) / previous.followers) * 100
        : null;
    return [
      {
        competitor,
        followers: latest.followers ?? null,
        postsPerWeek: latest.postsPerWeek ?? null,
        engagementRate: latest.engagementRate ?? null,
        growthPct,
        date: latest.date,
        previousDate: previous?.date || null,
        stale: latest.date < addDays(today(), -STALE_AFTER_DAYS),
      },
    ];
  });
  const you = ownMetrics(state, clientId, platform);
  const total =
    rows.reduce((n, r) => n + (r.followers || 0), 0) + (you?.followers || 0);
  for (const r of rows)
    r.share = total > 0 && r.followers !== null ? (r.followers / total) * 100 : null;
  const youShare = total > 0 && you?.followers != null ? (you.followers / total) * 100 : null;
  return {
    you: you ? { ...you, share: youShare } : null,
    rows,
    medians: Object.fromEntries(METRICS.map((m) => [m.key, median(rows.map((r) => r[m.key]))])),
  };
}

/** Plain-language read of where the client stands against the middle of the tracked field. */
export function gapInsights(table) {
  if (!table.you) return [];
  return METRICS.flatMap((m) => {
    const you = table.you[m.key];
    const mid = table.medians[m.key];
    const n = table.rows.filter((r) => r[m.key] !== null).length;
    if (you == null || mid == null || n < 1) return [];
    const diff = mid === 0 ? 0 : ((you - mid) / mid) * 100;
    const status = Math.abs(diff) < 10 ? "level" : diff > 0 ? "ahead" : "behind";
    return [{ key: m.key, label: m.label, you, median: mid, diff, status, sample: n }];
  });
}
