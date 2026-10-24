import { useMemo, useState } from "react";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDownRight, ArrowUpRight, Minus, Target } from "lucide-react";
import { addDaysTo, changeTone, channelMeasures, measureTrend, uploadDate } from "../shared/analysis.mjs";
import { Empty, fmt, niceDate, windowLabel } from "./components.jsx";

const COLOR = { green: "#2f7d4f", red: "#c0392b", neutral: "#7d887f" };
const LINE = "#3f7a5a";
const tms = (d) => Date.parse(`${d}T12:00:00Z`);
const iso = (t) => new Date(t).toISOString().slice(0, 10);
const longDate = (d) => niceDate(d, { month: "short", day: "numeric", year: "numeric" });
const pctText = (p, d = 1) => (p === null || p === undefined ? "" : `${p > 0 ? "+" : ""}${p.toFixed(d)}%`);
const signed = (v, unit) => `${v > 0 ? "+" : ""}${fmt(v, unit)}`;
const measureName = (m) => `${m.kpi.name} ${m.periodDays ? windowLabel(m.periodDays) : ""}`.trim();

/** One headline number per measure, so every tile reads the same way. */
function headline(m, t) {
  if (!t.ok) {
    if (!t.latest) return null;
    return { big: fmt(t.latest.value, m.kpi.unit), delta: null, pct: null, sub: "1 snapshot, add another to see growth", single: true };
  }
  if (t.kind === "total")
    return { big: fmt(t.end.value, m.kpi.unit), delta: t.gain, pct: t.pct, sub: `${signed(t.gain, m.kpi.unit)} this period` };
  return {
    big: fmt(t.avg, m.kpi.unit),
    delta: t.change,
    pct: t.pct,
    sub:
      t.prevAvg === null
        ? "no earlier period to compare"
        : t.halves
          ? "recent half vs earlier half"
          : `was ${fmt(t.prevAvg, m.kpi.unit)}`,
  };
}

function Delta({ pct, tone, size = 13 }) {
  const Icon = tone === "neutral" || pct === null ? Minus : pct > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="gr-delta" style={{ color: COLOR[tone] }}>
      <Icon size={size} /> {pct === null ? "—" : pctText(pct)}
    </span>
  );
}

function Sparkline({ points, color }) {
  if (points.length < 2) return null;
  const w = 120;
  const h = 34;
  const xs = points.map((p) => tms(p.date));
  const ys = points.map((p) => p.value);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const [y0, y1] = [Math.min(...ys), Math.max(...ys)];
  const px = (x) => 2 + ((x - x0) / (x1 - x0 || 1)) * (w - 4);
  const py = (y) => h - 3 - ((y - y0) / (y1 - y0 || 1)) * (h - 8);
  const d = points.map((p, i) => `${i ? "L" : "M"}${px(tms(p.date)).toFixed(1)} ${py(p.value).toFixed(1)}`).join(" ");
  const last = points.at(-1);
  return (
    <svg className="gr-spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L${px(tms(last.date))} ${h} L${px(x0)} ${h} Z`} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      <circle cx={px(tms(last.date))} cy={py(last.value)} r="2.6" fill={color} />
    </svg>
  );
}

function Tile({ m, t, active, onClick }) {
  const h = headline(m, t);
  const tone = h ? changeTone(h.pct ?? h.delta, m.kpi.direction) : "neutral";
  return (
    <button type="button" className={`gr-tile ${active ? "on" : ""}`} onClick={onClick} aria-pressed={active}>
      <span className="gr-tile-name">{measureName(m)}</span>
      {h ? (
        <>
          <span className="gr-tile-big">{h.big}</span>
          <span className="gr-tile-row">
            {!h.single && <Delta pct={h.pct} tone={tone} />}
            <small className="muted">{h.sub}</small>
          </span>
          <Sparkline points={t.series} color={COLOR[tone === "neutral" ? "neutral" : tone] || LINE} />
        </>
      ) : (
        <span className="gr-tile-empty muted small">{t.reason || "No numbers yet"}</span>
      )}
    </button>
  );
}

function GrowthTip({ active, payload, unit, name }) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="gr-tip">
      <strong>{longDate(iso(row.t))}</strong>
      {row.value !== undefined && (
        <div>
          <i style={{ background: LINE }} /> {name}: <b>{fmt(row.value, unit)}</b>
        </div>
      )}
      {row.prev !== undefined && (
        <div>
          <i className="dash" /> Previous period ({longDate(iso(row.prevT))}): <b>{fmt(row.prev, unit)}</b>
        </div>
      )}
      {row.uploads?.length > 0 && <div className="gr-tip-up">Published: {row.uploads.join(", ")}</div>}
    </div>
  );
}

export default function Growth({ state, account, from, to, rangeLabel, openForm }) {
  const measures = useMemo(() => channelMeasures(state, account.id), [state, account.id]);
  const trends = useMemo(
    () => Object.fromEntries(measures.map((m) => [m.key, measureTrend(state, { accountId: account.id, kpiId: m.kpiId, periodDays: m.periodDays, from, to })])),
    [state, account.id, measures, from, to],
  );
  const [picked, setPicked] = useState("");
  const [compare, setCompare] = useState(true);
  const [markers, setMarkers] = useState(true);

  if (!measures.length)
    return (
      <Empty
        title="No account-level numbers yet"
        description="Record this account's numbers (leave Post empty) and its growth will be charted here."
        action={<button className="btn primary" onClick={() => openForm("metric")}>Add numbers</button>}
      />
    );
  if (!from || !to) return <p className="muted">Choose a period with a start and end date.</p>;

  // Default hero: the first running total that has growth, otherwise any measure with data.
  const kpiOrder = (m) => account.kpis.findIndex((k) => k.id === m.kpiId);
  const tier = (m) => (trends[m.key].ok ? (m.periodDays === 0 ? 0 : 1) : 2);
  const usable = measures
    .filter((m) => trends[m.key].ok || trends[m.key].latest)
    .sort((a, b) => tier(a) - tier(b) || kpiOrder(a) - kpiOrder(b) || a.periodDays - b.periodDays);
  const missing = measures.filter((m) => !usable.includes(m));
  const hasGrowth = (m) => trends[m.key].ok;
  const hero =
    measures.find((m) => m.key === picked) ||
    usable.find((m) => hasGrowth(m) && m.periodDays === 0 && /follow|subscr/i.test(m.kpi.name)) ||
    usable.find((m) => hasGrowth(m) && /view|visitor/i.test(m.kpi.name)) ||
    usable.find(hasGrowth) ||
    usable[0] ||
    measures[0];
  const t = trends[hero.key];
  const h = headline(hero, t);
  const dirTone = h ? changeTone(h.pct ?? h.delta, hero.kpi.direction) : "neutral";
  const unit = hero.kpi.unit;

  // Chart rows: current window plus the previous window slid forward onto the same axis.
  const rows = new Map();
  const upsert = (d, patch) => rows.set(d, { ...(rows.get(d) || { t: tms(d) }), ...patch });
  t.series.forEach((p) => upsert(p.date, { value: p.value }));
  if (compare)
    t.prevSeries.forEach((p) => {
      const shifted = addDaysTo(p.date, t.len);
      upsert(shifted, { prev: p.value, prevT: tms(p.date) });
    });
  const posts = state.posts.filter((p) => p.accountId === account.id && p.status !== "cancelled" && uploadDate(p) >= from && uploadDate(p) <= to);
  const data = [...rows.values()].sort((a, b) => a.t - b.t);
  if (markers)
    for (const p of posts) {
      const d = uploadDate(p);
      const near = data.reduce((best, r) => (!best || Math.abs(r.t - tms(d)) < Math.abs(best.t - tms(d)) ? r : best), null);
      if (near && Math.abs(near.t - tms(d)) <= 4 * 86400000) near.uploads = [...(near.uploads || []), p.title];
    }

  // Campaign goals tracking this exact measure.
  const goals = state.campaigns
    .filter((c) => c.clientId === account.clientId && c.status !== "completed")
    .flatMap((c) => (c.goals || []).filter((g) => g.accountId === account.id && g.kpiId === hero.kpiId && (g.periodDays || 0) === hero.periodDays).map((g) => ({ ...g, campaign: c })));
  const goal = goals[0];
  const goalPct =
    goal && t.latest
      ? Math.max(0, Math.min(100, ((t.latest.value - goal.baseline) / (goal.target - goal.baseline || 1)) * 100))
      : null;

  const ranked = usable
    .map((m) => ({ m, h: headline(m, trends[m.key]) }))
    .filter((x) => x.h && x.h.pct !== null)
    .map((x) => ({ ...x, score: (x.m.kpi.direction === "decrease" ? -1 : 1) * x.h.pct }))
    .sort((a, b) => b.score - a.score);
  const winners = ranked.filter((x) => x.score >= 0.5).slice(0, 2);
  const watch = [...ranked].reverse().filter((x) => x.score <= -0.5).slice(0, 2);

  const stats = [];
  if (t.ok && t.kind === "total") {
    stats.push(["Now", fmt(t.end.value, unit), `as of ${niceDate(t.end.date)}`]);
    stats.push(["Growth", signed(t.gain, unit), pctText(t.pct)]);
    if (t.perWeek !== null) stats.push(["Pace", `${signed(t.perWeek, unit)} / week`, "average in this period"]);
    stats.push(["Previous period", t.prevGain === null ? "—" : signed(t.prevGain, unit), t.prevPct === null ? "no earlier snapshots" : pctText(t.prevPct)]);
  } else if (t.ok) {
    stats.push(["Latest", fmt(t.latest.value, unit), `week ending ${niceDate(t.latest.date)}`]);
    stats.push(["Average", fmt(t.avg, unit), t.note]);
    stats.push(["Best period", fmt(t.best.value, unit), `ending ${niceDate(t.best.date)}`]);
    stats.push([
      t.halves ? "Earlier half" : "Previous average",
      t.prevAvg === null ? "—" : fmt(t.prevAvg, unit),
      t.pct === null ? "no earlier period" : `recent ${t.halves ? "half " : ""}${fmt(t.recentAvg, unit)} (${pctText(t.pct)})`,
    ]);
  }

  const x0 = tms(from);
  const x1 = tms(to);
  const tickCount = 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => Math.round(x0 + ((x1 - x0) * i) / (tickCount - 1)));

  return (
    <>
      {(winners.length > 0 || watch.length > 0) && (
        <section className="gr-headlines">
          {winners.length > 0 && (
            <div className="gr-headline good">
              <b>Growing</b>
              {winners.map((x) => `${measureName(x.m)} ${pctText(x.h.pct)}`).join(" · ")}
            </div>
          )}
          {watch.length > 0 && (
            <div className="gr-headline bad">
              <b>Needs attention</b>
              {watch.map((x) => `${measureName(x.m)} ${pctText(x.h.pct)}`).join(" · ")}
            </div>
          )}
        </section>
      )}

      <div className="gr-tiles">
        {usable.map((m) => (
          <Tile key={m.key} m={m} t={trends[m.key]} active={m.key === hero.key} onClick={() => setPicked(m.key)} />
        ))}
      </div>
      {missing.length > 0 && (
        <p className="muted small gr-missing">
          No numbers in this period for: {missing.map(measureName).join(", ")}. Try a longer period.
        </p>
      )}

      <section className="panel gr-hero">
        <div className="gr-hero-head">
          <div>
            <h3>{measureName(hero)}</h3>
            <p className="muted small">
              {rangeLabel} · {longDate(from)} to {longDate(to)}
            </p>
          </div>
          {h && (
            <div className="gr-hero-delta">
              <span className="gr-hero-big">{h.big}</span>
              {!h.single && <Delta pct={h.pct} tone={dirTone} size={16} />}
            </div>
          )}
        </div>

        {!t.ok ? (
          <div className="gr-single">
            <p>
              {t.latest
                ? "Only one snapshot falls in this period, so there is no growth to chart yet. Record this account's number again next week (or import its history) and the trend appears here."
                : t.reason}
            </p>
            <button className="btn secondary" onClick={() => openForm("metric", null, { accountId: account.id, kpiId: hero.kpiId, periodDays: String(hero.periodDays || "") })}>
              Add numbers
            </button>
          </div>
        ) : (
          <>
            <div className="gr-stats">
              {stats.map(([label, value, sub]) => (
                <div key={label}>
                  <small>{label}</small>
                  <strong>{value}</strong>
                  <em>{sub}</em>
                </div>
              ))}
            </div>
            <div className="gr-toggles">
              <label>
                <input type="checkbox" checked={compare} onChange={(e) => setCompare(e.target.checked)} /> Compare with previous period
              </label>
              <label>
                <input type="checkbox" checked={markers} onChange={(e) => setMarkers(e.target.checked)} /> Show publishing dates
              </label>
            </div>
            <div style={{ height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 16, right: 24, bottom: 0, left: 4 }}>
                  <defs>
                    <linearGradient id="grFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={LINE} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={LINE} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="#edf0ed" />
                  <XAxis dataKey="t" type="number" scale="time" domain={[x0, x1]} ticks={ticks} tickFormatter={(v) => niceDate(iso(v))} axisLine={false} tickLine={false} tick={{ fill: "#5f6b5d", fontSize: 12 }} />
                  <YAxis axisLine={false} tickLine={false} width={64} tick={{ fill: "#5f6b5d", fontSize: 12 }} tickFormatter={(v) => fmt(v, unit)} domain={["auto", (max) => (goal ? Math.max(max, goal.target) : max)]} />
                  <Tooltip content={<GrowthTip unit={unit} name={measureName(hero)} />} />
                  {goal && <ReferenceLine y={goal.target} stroke="#b07d1e" strokeDasharray="6 4" label={{ value: `Goal ${fmt(goal.target, unit)}`, position: "insideTopRight", fill: "#b07d1e", fontSize: 12 }} />}
                  {markers &&
                    posts.map((p) => (
                      <ReferenceLine key={p.id} x={tms(uploadDate(p))} stroke="#9aa59d" strokeDasharray="2 4" />
                    ))}
                  {compare && <Line dataKey="prev" stroke="#a3aea6" strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: "#a3aea6", strokeWidth: 0 }} connectNulls isAnimationActive={false} />}
                  <Area dataKey="value" type="linear" stroke={LINE} strokeWidth={2.6} fill="url(#grFill)" connectNulls dot={{ r: 3.5, fill: LINE, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="gr-legend">
              <span><i style={{ background: LINE }} /> This period</span>
              {compare && <span><i className="dash" /> Previous {t.len} days ({niceDate(t.pFrom)} to {niceDate(t.pTo)})</span>}
              {markers && <span><i className="dot" /> Publishing date ({posts.length})</span>}
              {goal && <span><i className="gold" /> Goal · {goal.campaign.name}</span>}
            </div>
            {goal && goalPct !== null && (
              <div className="gr-goal">
                <Target size={15} />
                <div className="gr-goal-bar"><i style={{ width: `${goalPct}%` }} /></div>
                <span>
                  <b>{Math.round(goalPct)}%</b> of the way from {fmt(goal.baseline, unit)} to {fmt(goal.target, unit)} · {goal.campaign.name}
                  {goal.campaign.endDate ? `, ends ${niceDate(goal.campaign.endDate)}` : ""}
                </span>
              </div>
            )}
          </>
        )}
        <p className="muted small gr-note">
          {t.ok && t.kind === "total"
            ? "Growth compares the first and last snapshot in the period. Sparse snapshots make this a rough pace, not a daily count. "
            : "Each point is one reported period; the change compares the average period against the one before (or the recent half against the earlier half when nothing earlier is recorded). "}
          Publishing dates show timing only, not proof a post caused a change.
        </p>
      </section>
    </>
  );
}
