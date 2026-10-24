import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  Clock,
  FlaskConical,
  Pencil,
  Plus,
  Sparkles,
  Star,
  Trophy,
} from "lucide-react";
import { strategyPerformance } from "../shared/domain.mjs";
import {
  Badge,
  Empty,
  PanelHeader,
  Platform,
  fmt,
  niceDate,
  titleCase,
  windowLabel,
} from "./components.jsx";

const STATUSES = [
  ["testing", "Testing"],
  ["promising", "Promising"],
  ["adopted", "Adopted"],
  ["paused", "Paused"],
];
const STATUS_TONE = {
  testing: "purple",
  promising: "green",
  adopted: "green",
  paused: "amber",
};
const STATUS_HELP = {
  testing: "Still collecting results",
  promising: "Early results look good",
  adopted: "Now part of your regular approach",
  paused: "Not being run right now",
};
const PALETTE = [
  "#5f8a73",
  "#9784b4",
  "#c9a35c",
  "#5f93b0",
  "#c47f6a",
  "#8aa05a",
  "#b17f9d",
  "#6d7fb5",
];
const NO_STRATEGY = "#a9b0aa";

const strategyColor = (state, id) => {
  const index = state.strategies.findIndex((s) => s.id === id);
  return index < 0 ? NO_STRATEGY : PALETTE[index % PALETTE.length];
};

/** A KPI on one time window, so "first-week views" and "total views" never mix. */
const measureKey = (m) => `${m.kpiId}|${m.periodDays || 0}`;

/** Latest recorded value per measure (KPI + window) for one post. */
function postResults(state, postId) {
  const latest = new Map();
  for (const m of state.metrics) {
    if (m.postId !== postId) continue;
    const key = measureKey(m);
    const prev = latest.get(key);
    if (!prev || prev.date <= m.date) latest.set(key, m);
  }
  return latest;
}

/** Comparable measures an account has post results for. */
function measuresFor(account, metrics) {
  const seen = new Map();
  for (const m of metrics) {
    if (m.accountId !== account.id || !m.postId) continue;
    const k = account.kpis.find((x) => x.id === m.kpiId);
    if (!k) continue;
    const key = measureKey(m);
    if (!seen.has(key))
      seen.set(key, {
        ...k,
        id: key,
        name: m.periodDays ? `${k.name} · ${windowLabel(m.periodDays)}` : `${k.name} · running total`,
      });
  }
  return [...seen.values()];
}

export function StrategyCard({
  strategy: s,
  state,
  openForm,
  askClaude,
  mutate,
}) {
  const perf = strategyPerformance(state, s);
  const c = state.campaigns.find((c) => c.id === s.campaignId);
  const posts = state.posts.filter((p) => p.strategyId === s.id);
  const published = posts.filter((p) => p.status === "executed").length;
  const [busy, setBusy] = useState(false);
  const setStatus = async (status) => {
    if (status === s.status || busy) return;
    setBusy(true);
    await mutate("strategies", { ...s, status });
    setBusy(false);
  };
  return (
    <section
      className="panel strategy-card"
      style={{ "--accent": strategyColor(state, s.id) }}
    >
      <div className="strategy-card-top">
        <span className="strategy-icon">
          <FlaskConical size={18} />
        </span>
        <button
          className="btn ghost small"
          aria-label={`Edit ${s.name}`}
          onClick={() => openForm("strategy", s)}
        >
          <Pencil size={13} /> Edit
        </button>
      </div>
      <h3>{s.name}</h3>
      <span className="muted small">{c?.name}</span>
      <p>{s.hypothesis || "No hypothesis written yet. Click Edit to add one."}</p>
      <div className="status-switch" role="group" aria-label="Strategy status">
        {STATUSES.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={s.status === value ? "selected" : ""}
            aria-pressed={s.status === value}
            title={STATUS_HELP[value]}
            disabled={busy}
            onClick={() => setStatus(value)}
          >
            {value === "promising" && <Star size={12} />}
            {label}
          </button>
        ))}
      </div>
      <div className="strategy-result">
        <strong>
          {perf.score === null ? "—" : `${Math.round(perf.score)}%`}
        </strong>
        <span>
          {perf.score === null
            ? "No results yet. Record numbers for its posts to score it."
            : `of the way to your goals · from ${perf.samples} recorded result${perf.samples === 1 ? "" : "s"}`}
        </span>
      </div>
      <div className="strategy-review">
        <Clock size={14} /> Next assessment {niceDate(s.nextReviewDate)}{" "}
        <span>
          {published} of {posts.length} posts published
        </span>
      </div>
      <div className="card-actions">
        <button
          className="btn secondary small"
          onClick={() =>
            openForm("assessment", null, {
              entityType: "strategy",
              entityId: s.id,
            })
          }
        >
          Write assessment
        </button>
        <button
          className="btn ghost small"
          onClick={() =>
            openForm("post", null, {
              campaignId: s.campaignId,
              strategyId: s.id,
            })
          }
        >
          <Plus size={14} /> Plan content
        </button>
        {perf.score !== null && (
        <button
          className="btn ghost small"
          onClick={() =>
            askClaude(
              `Analyze the strategy "${s.name}" (${s.id}). Read its attributed metrics, posts, and assessments. Explain plausible reasons for its results, limitations, and propose one controlled follow-up experiment. Save a best practice with evidence if justified.`,
            )
          }
        >
          <Sparkles size={14} /> Ask Claude why
        </button>
        )}
      </div>
    </section>
  );
}

function ScoreChart({ state, list }) {
  const rows = list
    .filter((s) => s.performance.score !== null)
    .map((s) => ({
      id: s.id,
      name: s.name,
      score: Math.round(s.performance.score),
      samples: s.performance.samples,
      status: s.status,
    }))
    .sort((a, b) => b.score - a.score);
  if (!rows.length)
    return (
      <Empty
        icon={BarChart3}
        title="No scores yet"
        description="A strategy gets a score once you record results on one of its posts for a KPI that has a campaign goal."
      />
    );
  return (
    <div style={{ height: rows.length * 46 + 36 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ top: 4, right: 48, bottom: 4, left: 0 }}
        >
          <CartesianGrid horizontal={false} stroke="#edf0ed" strokeDasharray="3 4" />
          <XAxis
            type="number"
            domain={[
              (min) => Math.min(0, Math.floor(min / 25) * 25),
              (max) => Math.max(100, Math.ceil(max / 25) * 25),
            ]}
            tickFormatter={(v) => `${v}%`}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#5f6b5d", fontSize: 12 }}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={150}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#25342d", fontSize: 13 }}
            tickFormatter={(v) => (v.length > 22 ? `${v.slice(0, 21)}…` : v)}
          />
          <Tooltip
            cursor={{ fill: "#f3f6f1" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <div className="chart-tip">
                  <strong>{payload[0].payload.name}</strong>
                  <span>
                    {payload[0].payload.score}% of the way to goals ·{" "}
                    {payload[0].payload.samples} recorded result
                    {payload[0].payload.samples === 1 ? "" : "s"}
                  </span>
                  <span>Status: {titleCase(payload[0].payload.status)}</span>
                </div>
              ) : null
            }
          />
          <Bar dataKey="score" radius={[0, 6, 6, 0]} barSize={24}>
            {rows.map((r) => (
              <Cell key={r.id} fill={strategyColor(state, r.id)} />
            ))}
            <LabelList
              dataKey="score"
              position="right"
              formatter={(v) => `${v}%`}
              style={{ fill: "#25342d", fontSize: 12, fontWeight: 600 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CompareContent({ state, data, openForm, openPost }) {
  const accountIds = new Set(data.accounts.map((a) => a.id));
  const withResults = state.metrics.filter(
    (m) => m.postId && accountIds.has(m.accountId),
  );
  const accounts = data.accounts.filter((a) =>
    withResults.some((m) => m.accountId === a.id),
  );
  const [accountId, setAccountId] = useState("");
  const [kpiId, setKpiId] = useState("");
  const [mode, setMode] = useState("posts");
  const [hidden, setHidden] = useState([]);
  const account = accounts.find((a) => a.id === accountId) || accounts[0];
  const kpis = account ? measuresFor(account, withResults) : [];
  const kpi = kpis.find((k) => k.id === kpiId) || kpis[0];

  const posts = useMemo(
    () =>
      account
        ? data.posts
            .filter((p) => p.accountId === account.id)
            .map((p) => ({ post: p, results: postResults(state, p.id) }))
            .filter((r) => r.results.size > 0)
            .sort((a, b) => a.post.date.localeCompare(b.post.date))
        : [],
    [state, data.posts, account?.id],
  );
  const shown = posts.filter((r) => !hidden.includes(r.post.id));
  const better = (a, b) =>
    kpi?.direction === "decrease" ? a < b : a > b;

  if (!accounts.length)
    return (
      <Empty
        icon={BarChart3}
        title="Nothing to compare yet"
        description="Once a post is live, record its numbers (reach, views, likes…) and choose that post when you add them. They will appear here, side by side, grouped by strategy."
        action={
          <button className="btn secondary" onClick={() => openForm("metric")}>
            <Plus size={15} /> Add results for a post
          </button>
        }
      />
    );

  const bars = posts
    .filter((r) => !hidden.includes(r.post.id) && r.results.has(kpi?.id))
    .map((r) => ({
      id: r.post.id,
      label: r.post.title,
      value: r.results.get(kpi.id).value,
      date: r.results.get(kpi.id).date,
      strategyId: r.post.strategyId || "",
      strategy:
        state.strategies.find((s) => s.id === r.post.strategyId)?.name ||
        "No strategy",
      format: r.post.format,
    }));
  let chartRows = bars;
  if (mode === "strategies") {
    const groups = new Map();
    for (const b of bars) {
      const g = groups.get(b.strategyId) || {
        id: b.strategyId || "none",
        strategyId: b.strategyId,
        label: b.strategy,
        strategy: b.strategy,
        sum: 0,
        n: 0,
      };
      g.sum += b.value;
      g.n += 1;
      groups.set(b.strategyId, g);
    }
    chartRows = [...groups.values()].map((g) => ({
      ...g,
      value: g.sum / g.n,
      label: `${g.label} (${g.n} post${g.n === 1 ? "" : "s"})`,
    }));
  }
  chartRows = [...chartRows].sort((a, b) =>
    kpi?.direction === "decrease" ? a.value - b.value : b.value - a.value,
  );
  const leader = chartRows[0];
  const rest = chartRows.slice(1);
  const restAvg = rest.length
    ? rest.reduce((n, r) => n + r.value, 0) / rest.length
    : null;
  const liftText =
    leader && restAvg !== null && restAvg !== 0
      ? `${Math.abs(Math.round(((leader.value - restAvg) / Math.abs(restAvg)) * 100))}% ${leader.value >= restAvg ? "higher" : "lower"} than the average of the others (${fmt(restAvg, kpi.unit)})`
      : null;

  const usedStrategies = [
    ...new Map(
      bars.map((b) => [b.strategyId, { id: b.strategyId, name: b.strategy }]),
    ).values(),
  ];
  const columns = kpis.filter((k) => shown.some((r) => r.results.has(k.id)));
  const bestIn = (k) => {
    const values = shown
      .filter((r) => r.results.has(k.id))
      .map((r) => r.results.get(k.id).value);
    if (values.length < 2) return null;
    return values.reduce((a, b) => (better(a, b) ? a : b));
  };
  const toggle = (id) =>
    setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  return (
    <>
      <div className="compare-controls">
        <label className="field">
          <span>Account</span>
          <select
            value={account.id}
            onChange={(e) => {
              setAccountId(e.target.value);
              setKpiId("");
              setHidden([]);
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.handle} · {a.platform}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Compare on</span>
          <select value={kpi?.id || ""} onChange={(e) => setKpiId(e.target.value)}>
            {kpis.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
                {k.unit && k.unit !== "%" ? ` (${k.unit})` : ""}
              </option>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Group by</span>
          <div className="segmented">
            <button
              type="button"
              className={mode === "posts" ? "selected" : ""}
              onClick={() => setMode("posts")}
            >
              Each post
            </button>
            <button
              type="button"
              className={mode === "strategies" ? "selected" : ""}
              onClick={() => setMode("strategies")}
            >
              Strategy average
            </button>
          </div>
        </div>
      </div>

      {chartRows.length ? (
        <>
          <div style={{ height: chartRows.length * 46 + 36 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartRows}
                layout="vertical"
                margin={{ top: 4, right: 56, bottom: 4, left: 0 }}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="#edf0ed"
                  strokeDasharray="3 4"
                />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => fmt(v, kpi.unit)}
                  tick={{ fill: "#5f6b5d", fontSize: 12 }}
                />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={170}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#25342d", fontSize: 13 }}
                  tickFormatter={(v) => (v.length > 26 ? `${v.slice(0, 25)}…` : v)}
                />
                <Tooltip
                  cursor={{ fill: "#f3f6f1" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div className="chart-tip">
                        <strong>{payload[0].payload.label}</strong>
                        <span>
                          {kpi.name}: {fmt(payload[0].payload.value, kpi.unit)}
                        </span>
                        <span>Strategy: {payload[0].payload.strategy}</span>
                        {payload[0].payload.date && (
                          <span>
                            Recorded {niceDate(payload[0].payload.date)}
                          </span>
                        )}
                      </div>
                    ) : null
                  }
                />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={24}>
                  {chartRows.map((r) => (
                    <Cell key={r.id} fill={strategyColor(state, r.strategyId)} />
                  ))}
                  <LabelList
                    dataKey="value"
                    position="right"
                    formatter={(v) => fmt(v, kpi.unit)}
                    style={{ fill: "#25342d", fontSize: 12, fontWeight: 600 }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="compare-legend">
            {usedStrategies.map((s) => (
              <span key={s.id || "none"}>
                <i style={{ background: strategyColor(state, s.id) }} />
                {s.name}
              </span>
            ))}
          </div>
          {leader && (
            <div className="compare-summary">
              <Trophy size={18} />
              <div>
                <strong>
                  {leader.label.replace(/ \(\d+ posts?\)$/, "")} leads on{" "}
                  {kpi.name} with {fmt(leader.value, kpi.unit)}
                </strong>
                {liftText && <span>{liftText}.</span>}
                <span className="muted">
                  Each post reaches a different audience at a different time, so
                  treat this as a pattern worth testing, not proof of cause.
                </span>
              </div>
            </div>
          )}
        </>
      ) : (
        <Empty
          icon={BarChart3}
          title={`No ${kpi?.name || "results"} recorded for the selected posts`}
          description="Pick another measure above, or tick more posts below."
        />
      )}

      <div className="compare-posts">
        <h3>Posts included</h3>
        <div>
          {posts.map((r) => (
            <label
              key={r.post.id}
              className={hidden.includes(r.post.id) ? "off" : ""}
            >
              <input
                type="checkbox"
                checked={!hidden.includes(r.post.id)}
                onChange={() => toggle(r.post.id)}
              />
              <i
                style={{ background: strategyColor(state, r.post.strategyId) }}
              />
              {r.post.title}
            </label>
          ))}
        </div>
      </div>

      {shown.length > 0 && (
        <div className="table-wrap">
          <table className="data-table compare-table">
            <thead>
              <tr>
                <th>Post</th>
                <th>Strategy</th>
                {columns.map((k) => (
                  <th key={k.id}>{k.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.post.id}>
                  <td>
                    <button
                      className="link-cell"
                      onClick={() => openPost(r.post)}
                    >
                      <Platform platform={account.platform} size={13} />
                      <span>
                        <strong>{r.post.title}</strong>
                        <small>
                          {r.post.format} · {niceDate(r.post.date)}
                        </small>
                      </span>
                    </button>
                  </td>
                  <td>
                    <span className="strategy-dot">
                      <i
                        style={{
                          background: strategyColor(state, r.post.strategyId),
                        }}
                      />
                      {state.strategies.find((s) => s.id === r.post.strategyId)
                        ?.name || "None"}
                    </span>
                  </td>
                  {columns.map((k) => {
                    const m = r.results.get(k.id);
                    const best = bestIn(k);
                    return (
                      <td
                        key={k.id}
                        className={
                          m && best !== null && m.value === best ? "best" : ""
                        }
                      >
                        {m ? fmt(m.value, k.unit) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted small" style={{ marginTop: 10 }}>
            Highlighted cells are the best value in each column
            {kpi?.direction === "decrease"
              ? " (lower is better for this measure)"
              : ""}
            . Each number is the latest result recorded for that post.
          </p>
        </div>
      )}
    </>
  );
}

export function Strategies({
  state,
  data,
  openForm,
  askClaude,
  mutate,
  openPost,
  embedded = false,
}) {
  const [filter, setFilter] = useState("all");
  const list = data.strategies
    .map((s) => ({ ...s, performance: strategyPerformance(state, s) }))
    .sort(
      (a, b) =>
        (b.performance.score ?? -Infinity) -
        (a.performance.score ?? -Infinity),
    );
  const count = (status) => list.filter((s) => s.status === status).length;
  const shown = list.filter((s) => filter === "all" || s.status === filter);
  return (
    <>
      {!embedded && (
      <div className="page-heading">
        <div>
          <h1>Strategies</h1>
          <p className="muted">
            A strategy is the overall approach inside a campaign. Link your
            posts to it, record the results, and compare. Specific choices in a
            video are tactics (see the Tactics lab).
          </p>
        </div>
        <div className="heading-actions">
          <button className="btn primary" onClick={() => openForm("strategy")}>
            <Plus size={16} /> New strategy
          </button>
        </div>
      </div>
      )}

      <div className="lab-stats">
        {STATUSES.map(([value, label]) => (
          <button
            key={value}
            className={`lab-stat ${filter === value ? "selected" : ""}`}
            onClick={() => setFilter(filter === value ? "all" : value)}
          >
            <strong>{count(value)}</strong>
            <span>{label}</span>
            <small>{STATUS_HELP[value]}</small>
          </button>
        ))}
      </div>

      <div className="section-label">
        <h2>
          Your strategies <span>{shown.length}</span>
        </h2>
        <p className="muted small">
          Use the status buttons on a card to mark it Promising, Adopted or
          Paused.
        </p>
      </div>
      <div className="cards-grid fluid">
        {shown.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            state={state}
            openForm={openForm}
            askClaude={askClaude}
            mutate={mutate}
          />
        ))}
      </div>
      {!shown.length && (
        <Empty
          icon={FlaskConical}
          title={
            list.length ? "No strategies with this status" : "What will you test first?"
          }
          description={
            list.length
              ? "Choose a different status above."
              : "A strategy is one change you want to try, for example “show the making-of in the first 3 seconds”. Add one to a campaign, then link posts to it."
          }
          action={
            !list.length && (
              <button
                className="btn primary"
                onClick={() => openForm("strategy")}
              >
                New strategy
              </button>
            )
          }
        />
      )}
      <div className="lab-grid spaced">
        <section className="panel">
          <PanelHeader
            title="Which strategies are moving your goals?"
            description="Each bar shows how far results linked to a strategy have moved toward your campaign goals."
          />
          <ScoreChart state={state} list={list} />
        </section>
        <section className="panel">
          <PanelHeader
            title="Compare posts side by side"
            description="See how each post performed on the same measure, coloured by the strategy it belongs to."
          />
          <CompareContent
            state={state}
            data={data}
            openForm={openForm}
            openPost={openPost}
          />
        </section>
      </div>

      <div className="notice spaced">
        <FlaskConical size={18} />
        <span>
          Scores and comparisons only describe what you have recorded. Posts
          differ in topic, timing and audience, so a strong result is a reason to
          test the idea again, not proof that the strategy caused it.
        </span>
      </div>
    </>
  );
}
