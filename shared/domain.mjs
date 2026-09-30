/** Browser-safe calculations. Metric rows are snapshots, never daily totals. */
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addDays(date, days) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const ratio = (value, baseline, target) =>
  target === baseline
    ? value === target
      ? 100
      : 0
    : ((value - baseline) / (target - baseline)) * 100;

export function goalProgress(state, campaign, goal) {
  const now = today();
  const rows = (state.metrics || []).filter(
    (m) =>
      m.accountId === goal.accountId &&
      m.kpiId === goal.kpiId &&
      (!m.campaignId || m.campaignId === campaign.id) &&
      !m.strategyId &&
      !m.postId &&
      m.date >= campaign.startDate &&
      m.date <= campaign.endDate &&
      m.date <= now &&
      Number.isFinite(m.value),
  );
  const byDate = new Map();
  for (const m of rows) byDate.set(m.date, { date: m.date, value: m.value });
  const history = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const current = history.at(-1)?.value ?? goal.baseline;
  const duration =
    new Date(`${campaign.endDate}T12:00:00Z`) -
    new Date(`${campaign.startDate}T12:00:00Z`);
  const elapsed =
    new Date(`${now}T12:00:00Z`) - new Date(`${campaign.startDate}T12:00:00Z`);
  const expectedPercent =
    duration > 0
      ? clamp((elapsed / duration) * 100, 0, 100)
      : now >= campaign.startDate
        ? 100
        : 0;
  const percent = ratio(current, goal.baseline, goal.target);
  return {
    current,
    percent,
    expectedPercent,
    onTrack: history.length > 0 && percent >= expectedPercent,
    history,
    hasData: history.length > 0,
  };
}

export function notifications(state, now = today()) {
  const items = [];
  const horizon = addDays(now, 7);
  const add = (id, title, detail, date, entityType, entityId) => {
    if (!date || date > horizon) return;
    items.push({
      id,
      title,
      detail,
      date,
      severity: date < now ? "overdue" : date === now ? "due" : "upcoming",
      entityType,
      entityId,
    });
  };
  const running = new Set(
    (state.campaigns || [])
      .filter((c) => !["completed", "paused"].includes(c.status))
      .map((c) => c.id),
  );
  for (const c of state.campaigns || [])
    if (running.has(c.id))
      add(
        `campaign:${c.id}`,
        `Assess ${c.name}`,
        `Campaign assessment · every ${c.reviewEveryDays} days`,
        c.nextReviewDate,
        "campaign",
        c.id,
      );
  for (const s of state.strategies || [])
    if (running.has(s.campaignId) && s.status !== "paused")
      add(
        `strategy:${s.id}`,
        `Review ${s.name}`,
        `Strategy assessment · every ${s.reviewEveryDays} days`,
        s.nextReviewDate,
        "strategy",
        s.id,
      );
  for (const p of state.posts || []) {
    if (p.status === "planned")
      add(
        `publish:${p.id}`,
        p.title,
        `${p.format} planned · content ${p.readiness}`,
        p.date,
        "post",
        p.id,
      );
    if (p.status === "executed" && p.executedAt) {
      const assessed = (state.assessments || []).some(
        (a) =>
          a.entityType === "post" &&
          a.entityId === p.id &&
          a.date >= p.executedAt,
      );
      if (!assessed)
        add(
          `assess:${p.id}`,
          `Assess ${p.title}`,
          "Review results and capture what changed",
          addDays(
            p.executedAt,
            p.reviewAfterDays ?? state.settings?.postReviewDays ?? 7,
          ),
          "post",
          p.id,
        );
    }
  }
  for (const r of state.reminders || []) {
    if (r.done) continue;
    if (r.type === "date")
      add(
        `reminder:${r.id}`,
        r.title,
        "Scheduled reminder",
        r.date,
        "reminder",
        r.id,
      );
    else if (!r.date || r.date <= now) {
      const c = (state.campaigns || []).find((c) => c.id === r.campaignId);
      const g = c?.goals.find((g) => g.id === r.goalId);
      if (!g) continue;
      const progress = goalProgress(state, c, g);
      const reached =
        r.comparison === "below"
          ? progress.percent < r.threshold
          : progress.percent >= r.threshold;
      if (reached)
        add(
          `reminder:${r.id}`,
          r.title,
          `${Math.round(progress.percent)}% of goal progress · trigger ${r.comparison} ${r.threshold}%${progress.hasData ? "" : " · no observations yet"}`,
          now,
          "reminder",
          r.id,
        );
    }
  }
  return items.sort(
    (a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
  );
}

export function strategyPerformance(state, strategy) {
  const campaign = (state.campaigns || []).find(
    (c) => c.id === strategy.campaignId,
  );
  if (!campaign)
    return {
      score: null,
      samples: 0,
      metrics: [],
      interpretation: "Association, not proof of causality",
    };
  const posts = new Set(
    (state.posts || [])
      .filter((p) => p.strategyId === strategy.id)
      .map((p) => p.id),
  );
  const rows = (state.metrics || []).filter(
    (m) =>
      (m.strategyId === strategy.id || posts.has(m.postId)) &&
      m.date >= campaign.startDate &&
      m.date <= campaign.endDate &&
      m.date <= today(),
  );
  const latest = new Map();
  for (const row of rows) {
    const key = `${row.accountId}:${row.kpiId}:${row.postId || ""}`;
    if (!latest.has(key) || latest.get(key).date <= row.date)
      latest.set(key, row);
  }
  const metrics = [...latest.values()].flatMap((m) => {
    const goal = campaign.goals.find(
      (g) => g.accountId === m.accountId && g.kpiId === m.kpiId,
    );
    if (!goal) return [];
    const kpi = (state.accounts || [])
      .find((a) => a.id === m.accountId)
      ?.kpis.find((k) => k.id === m.kpiId);
    return [
      {
        accountId: m.accountId,
        kpiId: m.kpiId,
        kpiName: kpi?.name || m.kpiId,
        value: m.value,
        baseline: goal.baseline,
        target: goal.target,
        percent: ratio(m.value, goal.baseline, goal.target),
        date: m.date,
        postId: m.postId,
      },
    ];
  });
  return {
    score: metrics.length
      ? metrics.reduce((n, m) => n + m.percent, 0) / metrics.length
      : null,
    samples: rows.length,
    metrics,
    interpretation: "Association, not proof of causality",
  };
}
