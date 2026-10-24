import { useState } from "react";
import { Plus, Settings2 } from "lucide-react";
import { addDays, goalProgress } from "../shared/domain.mjs";
import { GoalBar, MetricPanel, Tile } from "./AccountMetrics.jsx";
import {
  Dialog,
  Platform,
  fmt,
  niceDate,
  windowLabel,
} from "./components.jsx";

const DAY = 86400000;
const daysBetween = (a, b) =>
  (new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / DAY;

/**
 * Weekly numbers grouped into calendar months for display only. Each week counts
 * in the month its last day (the recorded date) falls in; months are never merged.
 */
function monthlyFromWeekly(weekly, monthlyActual) {
  const months = new Map();
  for (const m of weekly) {
    const key = m.date.slice(0, 7);
    const g = months.get(key) || { key, weeks: [], straddle: 0 };
    g.weeks.push(m);
    const startMonth = addDays(m.date, -6).slice(0, 7);
    if (startMonth !== key) g.straddle += 1;
    months.set(key, g);
  }
  return [...months.values()]
    .sort((a, b) => a.key.localeCompare(b.key))
    .map((g) => {
      const sum = g.weeks.reduce((n, m) => n + m.value, 0);
      const [y, mo] = g.key.split("-").map(Number);
      const daysInMonth = new Date(Date.UTC(y, mo, 0)).getUTCDate();
      const covered = new Set(g.weeks.map((m) => m.date)).size * 7;
      const actual = monthlyActual
        .filter((m) => m.date.slice(0, 7) === g.key)
        .sort((a, b) => a.date.localeCompare(b.date))
        .at(-1);
      return {
        ...g,
        sum,
        avg: sum / g.weeks.length,
        full: covered >= daysInMonth - 1,
        actual,
      };
    });
}

/** Pop-up with growth, trend and goal progress for one social account. */
export default function AccountDetail({ account, state, onClose, openForm }) {
  const client = state.clients.find((c) => c.id === account.clientId);
  const own = (m) =>
    m.accountId === account.id && !m.postId && !m.strategyId;
  const withData = account.kpis.filter((k) =>
    state.metrics.some((m) => own(m) && m.kpiId === k.id),
  );
  const [kpiId, setKpiId] = useState((withData[0] || account.kpis[0])?.id);
  const kpi = account.kpis.find((k) => k.id === kpiId);

  const totals = state.metrics
    .filter((m) => own(m) && m.kpiId === kpiId && !m.periodDays)
    .sort((a, b) => a.date.localeCompare(b.date));
  const periodic = new Map();
  for (const m of state.metrics)
    if (own(m) && m.kpiId === kpiId && m.periodDays) {
      const list = periodic.get(m.periodDays) || [];
      list.push(m);
      periodic.set(m.periodDays, list);
    }
  const periodSeries = [...periodic.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([days, list]) => ({
      days,
      list: [...list].sort((a, b) => a.date.localeCompare(b.date)),
    }));
  const toPoints = (list) => list.map((m) => ({ date: m.date, value: m.value }));

  // Per-video results for this KPI, grouped by the window they cover.
  const videoMap = new Map();
  for (const m of state.metrics) {
    if (m.accountId !== account.id || m.kpiId !== kpiId || !m.postId) continue;
    const post = state.posts.find((p) => p.id === m.postId);
    if (!post) continue;
    const key = `${m.periodDays || 0}|${post.id}`;
    const prev = videoMap.get(key);
    if (!prev || prev.date <= m.date)
      videoMap.set(key, { post, value: m.value, date: m.date, days: m.periodDays || 0 });
  }
  const videoGroups = [...new Set([...videoMap.values()].map((r) => r.days))]
    .sort((a, b) => a - b)
    .map((days) => ({
      days,
      rows: [...videoMap.values()]
        .filter((r) => r.days === days)
        .sort((a, b) => b.value - a.value),
    }));

  const goals = state.campaigns
    .filter((c) => c.clientId === account.clientId)
    .flatMap((c) =>
      c.goals
        .filter((g) => g.accountId === account.id)
        .map((g) => ({ campaign: c, goal: g, ...goalProgress(state, c, g) })),
    );
  const shownGoals = goals.filter((g) => g.goal.kpiId === kpiId);
  const totalGoal = shownGoals.find((g) => !g.goal.periodDays);
  const hasAny = totals.length > 0 || periodic.size > 0;

  return (
    <Dialog
      wide
      title={`${account.platform} · ${account.handle}`}
      description={`${client?.name || ""}${client?.startDate ? ` · with us since ${niceDate(client.startDate, { month: "short", day: "numeric", year: "numeric" })}` : ""}`}
      onClose={onClose}
    >
      <div className="chip-row" role="tablist" aria-label="KPI">
        {account.kpis.map((k) => (
          <button
            type="button"
            key={k.id}
            className={`chip ${k.id === kpiId ? "on" : ""}`}
            aria-pressed={k.id === kpiId}
            onClick={() => setKpiId(k.id)}
          >
            <Platform platform={account.platform} size={13} /> {k.name}
          </button>
        ))}
      </div>

      {!kpi ? (
        <p className="muted">This account has no KPIs yet. Edit the account to add some.</p>
      ) : (
        <>
          {!hasAny && (
            <p className="muted">
              No numbers recorded for {kpi.name} yet. Add numbers to see growth here.
            </p>
          )}

          {totals.length > 0 && (
            <MetricPanel
              kind="total"
              title="Growth over time"
              subtitle={`${kpi.name} · running total · whole account`}
              points={toPoints(totals)}
              kpi={kpi}
              target={totalGoal?.goal.target}
              color="#5d8a6d"
            />
          )}

          {periodSeries.map(({ days, list }) => (
            <MetricPanel
              key={days}
              kind="period"
              title={`${kpi.name} ${windowLabel(days)}`}
              subtitle="whole account"
              points={toPoints(list)}
              kpi={kpi}
              target={shownGoals.find((g) => g.goal.periodDays === days)?.goal.target}
              color="#9784b4"
              note={
                !totals.length && days === periodSeries[0].days && periodSeries.length === 1
                  ? "No running total recorded, so growth is measured on these per-period numbers."
                  : ""
              }
            />
          ))}

          {periodic.has(7) && (() => {
            const rows = monthlyFromWeekly(
              periodic.get(7),
              [...periodic.entries()]
                .filter(([d]) => d >= 28 && d <= 31)
                .flatMap(([, l]) => l),
            );
            const people =
              kpi.unit === "people" || /unique|visitor|reach|audience|user/i.test(kpi.name);
            const maxAvg = Math.max(...rows.map((r) => r.avg), 1);
            return (
              <details className="metric-panel monthly">
                <summary>
                  <strong>Monthly view</strong>
                  <small className="muted"> · estimated from weekly numbers</small>
                </summary>
                <p className="muted small">
                  <strong>Estimate.</strong> Each week is placed in the calendar month
                  its last day falls in, and months are never combined.
                  {people
                    ? " Because the same person can be counted in several weeks, adding weekly unique numbers overstates the real monthly figure. Treat the total as an upper bound."
                    : " A week that spans two months is counted fully in the month it ends."}{" "}
                  Recorded monthly numbers, when you have them, are shown separately and are
                  not mixed in.
                </p>
                <div className="table-wrap">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Month</th>
                        <th>Weeks used</th>
                        <th>Sum of weeks (estimate)</th>
                        <th>Average per week</th>
                        <th>Recorded monthly</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key}>
                          <td>
                            {niceDate(`${r.key}-01`, { month: "long", year: "numeric" })}
                          </td>
                          <td>
                            {r.weeks.length}
                            {!r.full && <small className="muted"> · incomplete month</small>}
                            {r.straddle > 0 && (
                              <small className="muted">
                                {" "}· {r.straddle} week{r.straddle === 1 ? "" : "s"} began in the previous month
                              </small>
                            )}
                          </td>
                          <td>
                            ≈ {fmt(r.sum, kpi.unit)}
                            <small className="muted"> estimate</small>
                          </td>
                          <td>
                            <span className="video-bar slim">
                              <i style={{ width: `${Math.max(2, (r.avg / maxAvg) * 100)}%` }} />
                            </span>
                            {fmt(r.avg, kpi.unit)}
                          </td>
                          <td>
                            {r.actual ? (
                              <>
                                {fmt(r.actual.value, kpi.unit)}
                                <small className="muted"> {niceDate(r.actual.date)}</small>
                              </>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            );
          })()}

          {videoGroups.length > 0 && (
            <section className="metric-panel">
              <h3 className="wizard-subtitle">
                {kpi.name} per post or video{" "}
                <small className="muted">· separate from the whole-account numbers above</small>
              </h3>
              {videoGroups.map((g) => {
                const max = Math.max(...g.rows.map((r) => r.value), 1);
                const avg = g.rows.reduce((n, r) => n + r.value, 0) / g.rows.length;
                const hi = g.rows[0];
                const lo = g.rows.at(-1);
                const lowerBetter = kpi.direction === "decrease";
                return (
                  <div key={g.days} className="video-group">
                    <p className="muted small">
                      {g.days ? `Each video's numbers cover ${g.days} days` : "Running total per video"} ·{" "}
                      {g.rows.length} video{g.rows.length === 1 ? "" : "s"}
                    </p>
                    <div className="metric-tiles">
                      <Tile label="Average" value={fmt(avg, kpi.unit)} />
                      <Tile
                        label="Lowest"
                        value={fmt(lo.value, kpi.unit)}
                        sub={lo.post.title}
                        tone={lowerBetter ? "good-text" : ""}
                      />
                      <Tile
                        label="Highest"
                        value={fmt(hi.value, kpi.unit)}
                        sub={hi.post.title}
                        tone={lowerBetter ? "" : "good-text"}
                      />
                    </div>
                    <div className="video-rows">
                      {g.rows.map((r) => (
                        <div className="video-row" key={r.post.id}>
                          <span title={r.post.title}>{r.post.title}</span>
                          <span className="video-bar">
                            <i
                              className={r.value >= avg ? "above" : "below"}
                              style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }}
                            />
                            <b className="video-avg-tick" style={{ left: `${(avg / max) * 100}%` }} title={`Average ${fmt(avg, kpi.unit)}`} />
                          </span>
                          <strong>{fmt(r.value, kpi.unit)}</strong>
                          <small className="muted">{niceDate(r.date)}</small>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          <section className="metric-panel">
            <h3 className="wizard-subtitle">Goal progress</h3>
            {shownGoals.length ? (
              <div className="account-goals">
                {shownGoals.map((g) => (
                  <GoalBar
                    key={g.goal.id}
                    goal={g.goal}
                    g={g}
                    kpi={kpi}
                    campaignName={g.campaign.name}
                    windowText={g.goal.periodDays ? windowLabel(g.goal.periodDays) : ""}
                  />
                ))}
              </div>
            ) : (
              <p className="muted small">
                No campaign goal on {kpi.name} for this account. Add one from a campaign.
              </p>
            )}
          </section>
        </>
      )}

      <div className="dialog-footer">
        <button
          type="button"
          className="btn secondary"
          onClick={() => {
            onClose();
            openForm("account", account);
          }}
        >
          <Settings2 size={15} /> Edit account
        </button>
        <button
          type="button"
          className="btn primary"
          onClick={() => {
            onClose();
            openForm("metric", null, { accountId: account.id, kpiId });
          }}
        >
          <Plus size={15} /> Add numbers
        </button>
      </div>
    </Dialog>
  );
}
