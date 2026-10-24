import { useState } from "react";
import { Badge, Platform, fmt, niceDate, windowLabel } from "./components.jsx";

/** Whole-account snapshots only: post/strategy observations are not account totals. */
const series = (state, account, kpi) =>
  state.metrics
    .filter(
      (m) =>
        m.accountId === account.id &&
        m.kpiId === kpi.id &&
        !m.postId &&
        !m.strategyId &&
        !m.periodDays,
    )
    .sort((a, b) => a.date.localeCompare(b.date));

/** Per-period numbers (e.g. weekly views): average before vs after the take-on date. */
export function periodRowsFor(state, client) {
  const start = client.startDate;
  const groups = new Map();
  for (const m of state.metrics) {
    if (!m.periodDays || m.postId || m.strategyId) continue;
    const a = state.accounts.find((x) => x.id === m.accountId);
    if (!a || a.clientId !== client.id) continue;
    const k = a.kpis.find((x) => x.id === m.kpiId);
    if (!k) continue;
    const key = `${a.id}:${k.id}:${m.periodDays}`;
    const g = groups.get(key) || {
      account: a,
      kpi: k,
      periodDays: m.periodDays,
      before: [],
      after: [],
    };
    (start && m.date <= start ? g.before : g.after).push(m);
    groups.set(key, g);
  }
  const avg = (l) =>
    l.length ? l.reduce((n, m) => n + m.value, 0) / l.length : null;
  return [...groups.values()].map((g) => {
    const b = avg(g.before);
    const a = avg(g.after);
    return {
      ...g,
      beforeAvg: b,
      afterAvg: a,
      percent: b && a !== null ? ((a - b) / Math.abs(b)) * 100 : null,
    };
  });
}

export function rowsFor(state, client) {
  const start = client.startDate;
  return state.accounts
    .filter((a) => a.clientId === client.id)
    .flatMap((a) =>
      a.kpis.map((k) => {
        const all = series(state, a, k);
        const atStart = start
          ? all.filter((m) => m.date <= start).at(-1)
          : all[0];
        const after = start ? all.filter((m) => m.date > start) : all.slice(1);
        const latest = after.at(-1);
        const change =
          atStart && latest ? latest.value - atStart.value : null;
        return {
          account: a,
          kpi: k,
          before: all.filter((m) => start && m.date < start).length,
          atStart,
          latest,
          change,
          percent:
            change !== null && atStart.value !== 0
              ? (change / Math.abs(atStart.value)) * 100
              : null,
        };
      }),
    );
}

export default function BeforeAfter({ state, client }) {
  const [by, setBy] = useState("kpi");
  const rows = rowsFor(state, client).sort((a, b) =>
    by === "kpi"
      ? a.kpi.name.localeCompare(b.kpi.name) ||
        a.account.platform.localeCompare(b.account.platform)
      : a.account.platform.localeCompare(b.account.platform) ||
        a.kpi.name.localeCompare(b.kpi.name),
  );
  const periodRows = periodRowsFor(state, client);
  const direction = (r) => (r.kpi.direction === "decrease" ? -1 : 1);
  if (!rows.length) return null;
  return (
    <section className="panel" style={{ marginTop: 16 }}>
      <div className="brand-section-heading">
        <div>
          <h3>Before and after you took them on</h3>
          <span className="muted small">
            {client.startDate
              ? `Starting numbers are the latest snapshot on or before ${niceDate(client.startDate)}. Edit the client to change that date.`
              : "Add the date you started working with this client (Edit client) to compare before and after. Until then, the first recorded number counts as the start."}
          </span>
        </div>
        <div className="chip-row">
          {[
            ["kpi", "Group by KPI"],
            ["platform", "Group by platform"],
          ].map(([v, label]) => (
            <button
              key={v}
              type="button"
              className={`chip ${by === v ? "on" : ""}`}
              aria-pressed={by === v}
              onClick={() => setBy(v)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>{by === "kpi" ? "KPI" : "Platform"}</th>
            <th>{by === "kpi" ? "Platform" : "KPI"}</th>
            <th>At start</th>
            <th>Latest</th>
            <th>Change</th>
            <th>Numbers before you started</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const good =
              r.change === null ? null : r.change * direction(r) >= 0;
            const platform = (
              <>
                <Platform platform={r.account.platform} size={14} />{" "}
                {r.account.platform}
              </>
            );
            return (
              <tr key={`${r.account.id}:${r.kpi.id}`}>
                <td>{by === "kpi" ? r.kpi.name : platform}</td>
                <td>{by === "kpi" ? platform : r.kpi.name}</td>
                <td>
                  {r.atStart ? (
                    <>
                      {fmt(r.atStart.value, r.kpi.unit)}
                      <small className="muted"> {niceDate(r.atStart.date)}</small>
                    </>
                  ) : (
                    "—"
                  )}
                </td>
                <td>
                  {r.latest ? (
                    <>
                      {fmt(r.latest.value, r.kpi.unit)}
                      <small className="muted"> {niceDate(r.latest.date)}</small>
                    </>
                  ) : (
                    "no newer number"
                  )}
                </td>
                <td>
                  {r.change === null ? (
                    "—"
                  ) : (
                    <Badge tone={r.change === 0 ? "neutral" : good ? "green" : "red"}>
                      {r.change > 0 ? "+" : ""}
                      {fmt(r.change, r.kpi.unit)}
                      {r.percent !== null
                        ? ` (${r.percent > 0 ? "+" : ""}${r.percent.toFixed(1)}%)`
                        : ""}
                    </Badge>
                  )}
                </td>
                <td>{r.before || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {periodRows.length > 0 && (
        <>
          <h3 style={{ marginTop: 20 }}>Per-period numbers (average before vs after)</h3>
          <table className="data-table">
            <thead>
              <tr>
                <th>Platform</th>
                <th>KPI</th>
                <th>Window</th>
                <th>Before (avg)</th>
                <th>After (avg)</th>
                <th>Change</th>
              </tr>
            </thead>
            <tbody>
              {periodRows.map((r) => {
                const good =
                  r.percent === null ? null : r.percent * direction(r) >= 0;
                return (
                  <tr key={`${r.account.id}:${r.kpi.id}:${r.periodDays}`}>
                    <td>
                      <Platform platform={r.account.platform} size={14} />{" "}
                      {r.account.platform}
                    </td>
                    <td>{r.kpi.name}</td>
                    <td>{windowLabel(r.periodDays)}</td>
                    <td>
                      {r.beforeAvg === null ? "—" : fmt(r.beforeAvg, r.kpi.unit)}
                      <small className="muted"> {r.before.length} recorded</small>
                    </td>
                    <td>
                      {r.afterAvg === null ? "—" : fmt(r.afterAvg, r.kpi.unit)}
                      <small className="muted"> {r.after.length} recorded</small>
                    </td>
                    <td>
                      {r.percent === null ? (
                        "—"
                      ) : (
                        <Badge tone={good ? "green" : "red"}>
                          {r.percent > 0 ? "+" : ""}
                          {r.percent.toFixed(1)}%
                        </Badge>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <p className="muted small">
        These are whole-account numbers. Differences show what changed, not
        why. Compare videos, tactics and strategies on the Analysis page.
      </p>
    </section>
  );
}
