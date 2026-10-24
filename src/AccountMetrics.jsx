import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Sparkline, TrendChart, fmt, niceDate } from "./components.jsx";

const DAY = 86400000;
const daysBetween = (a, b) =>
  (new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / DAY;
const GOOD = "#2f7d4f";
const BAD = "#c0392b";
const NEUTRAL = "#a3aba6";

const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

/** Signed number: "+1,200", "-3.5 pts" (percent KPIs move in points, not percent). */
export const signed = (v, unit) =>
  `${v > 0 ? "+" : v < 0 ? "-" : ""}${unit === "%" ? `${fmt(Math.abs(v))} pts` : fmt(Math.abs(v), unit)}`;
const signedPct = (v, digits = 1) =>
  `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(digits)}%`;

/** Everything the panels show, computed from one dated series. */
export function seriesStats(points, kpi) {
  const n = points.length;
  if (!n) return null;
  const lowerBetter = kpi.direction === "decrease";
  const first = points[0];
  const latest = points.at(-1);
  const prev = n > 1 ? points.at(-2) : null;
  let low = points[0];
  let high = points[0];
  for (const p of points) {
    if (p.value < low.value) low = p;
    if (p.value > high.value) high = p;
  }
  const avg = points.reduce((s, p) => s + p.value, 0) / n;
  const sd = Math.sqrt(points.reduce((s, p) => s + (p.value - avg) ** 2, 0) / n);
  const cv = avg !== 0 ? sd / Math.abs(avg) : 0;
  const good = (v) => (lowerBetter ? -v : v);

  const change = n > 1 ? latest.value - first.value : null;
  const pct = change !== null && first.value !== 0 ? (change / Math.abs(first.value)) * 100 : null;
  const span = n > 1 ? daysBetween(first.date, latest.date) : 0;
  const perWeek = change !== null && span > 0 ? (change / span) * 7 : null;
  const pctPerWeek = pct !== null && span > 0 ? (pct / span) * 7 : null;
  const vsPrev = prev ? latest.value - prev.value : null;
  const vsPrevPct = prev && prev.value !== 0 ? (vsPrev / Math.abs(prev.value)) * 100 : null;
  const vsAvg = avg !== 0 ? ((latest.value - avg) / Math.abs(avg)) * 100 : null;

  // Step-by-step movement between consecutive entries.
  const steps = points.slice(1).map((p, i) => ({
    date: p.date,
    from: points[i].date,
    value: p.value - points[i].value,
  }));
  const bestStep = steps.length
    ? steps.reduce((b, s) => (good(s.value) > good(b.value) ? s : b))
    : null;
  const worstStep = steps.length
    ? steps.reduce((b, s) => (good(s.value) < good(b.value) ? s : b))
    : null;
  const avgStep = steps.length ? steps.reduce((s, x) => s + x.value, 0) / steps.length : null;

  // Recent momentum: average of the latest few vs the few before them.
  const k = Math.min(3, Math.floor(n / 2));
  let momentum = null;
  if (k >= 2 && n >= k * 2) {
    const recent = points.slice(-k).reduce((s, p) => s + p.value, 0) / k;
    const before = points.slice(-2 * k, -k).reduce((s, p) => s + p.value, 0) / k;
    if (before !== 0) momentum = { pct: ((recent - before) / Math.abs(before)) * 100, k };
  }
  const rank = 1 + points.filter((p) => good(p.value) > good(latest.value)).length;
  const positive = steps.filter((s) => good(s.value) > 0).length;

  return {
    n, lowerBetter, good, first, latest, prev, low, high, avg, cv,
    change, pct, span, perWeek, pctPerWeek, vsPrev, vsPrevPct, vsAvg,
    steps, bestStep, worstStep, avgStep, momentum, rank, positive,
    best: lowerBetter ? low : high,
    worst: lowerBetter ? high : low,
  };
}

const toneClass = (good, v) => {
  const e = good(v);
  return e > 0 ? "good-text" : e < 0 ? "bad-text" : "";
};

function DeltaChip({ value, label, text, good }) {
  if (value === null || value === undefined) return null;
  const e = good(value);
  const Icon = value > 0 ? TrendingUp : value < 0 ? TrendingDown : Minus;
  return (
    <span className={`delta-chip ${e > 0 ? "up" : e < 0 ? "down" : "flat"}`}>
      <Icon size={13} /> {text} <small>{label}</small>
    </span>
  );
}

export function Tile({ label, value, sub, tone = "", accent }) {
  return (
    <div className={`metric-tile ${accent || ""}`}>
      <span className="muted small">{label}</span>
      <strong className={tone}>{value}</strong>
      {sub && <small className="muted">{sub}</small>}
    </div>
  );
}

/** Lowest ──●── Highest bar with the average and the latest value marked on it. */
function RangeMeter({ s, unit }) {
  const lo = s.low.value;
  const hi = s.high.value;
  const pos = (v) => (hi === lo ? 50 : ((v - lo) / (hi - lo)) * 100);
  const ok = s.good(s.latest.value - s.avg) >= 0;
  return (
    <div className="range-meter" aria-label="Where the latest value sits between lowest and highest">
      <div className="range-ends">
        <span>
          <small className="muted">Lowest</small>
          <strong>{fmt(lo, unit)}</strong>
        </span>
        <span className="right">
          <small className="muted">Highest</small>
          <strong>{fmt(hi, unit)}</strong>
        </span>
      </div>
      <div className={`range-track ${s.lowerBetter ? "flip" : ""}`}>
        <i className="range-fill" style={{ width: `${pos(s.latest.value)}%`, background: ok ? GOOD : BAD }} />
        <i className="range-avg" style={{ left: `${pos(s.avg)}%` }} title={`Average ${fmt(s.avg, unit)}`} />
        <i
          className="range-now"
          style={{ left: `${pos(s.latest.value)}%`, borderColor: ok ? GOOD : BAD }}
          title={`Latest ${fmt(s.latest.value, unit)}`}
        />
      </div>
      <div className="range-legend muted small">
        <span><i className="dot now" /> Latest</span>
        <span><i className="dot avg" /> Average {fmt(s.avg, unit)}</span>
        {hi !== lo && (
          <span>
            Latest is {Math.round(pos(s.latest.value))}% of the way from lowest to highest
          </span>
        )}
      </div>
    </div>
  );
}

/** Bars showing how much the number moved between each pair of entries. */
function ChangeBars({ s, unit }) {
  if (s.steps.length < 2) return null;
  const data = s.steps.map((x) => ({ date: x.date, value: x.value }));
  return (
    <div>
      <h4 className="metric-sub">Change at each update</h4>
      <div className="chart" style={{ height: 130, minWidth: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 6, right: 20, bottom: 0, left: 2 }}>
            <CartesianGrid vertical={false} stroke="#edf0ed" strokeDasharray="3 4" />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => niceDate(d)}
              axisLine={false}
              tickLine={false}
              minTickGap={35}
              tick={{ fill: "#5f6b5d", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmt(v, unit)}
              tick={{ fill: "#5f6b5d", fontSize: 12 }}
              width={51}
            />
            <ReferenceLine y={0} stroke="#cfd6cf" />
            <Tooltip
              labelFormatter={(d) => niceDate(d)}
              formatter={(v) => [signed(v, unit), "Change"]}
              contentStyle={{ border: "1px solid #e4e9e4", borderRadius: 10, fontSize: 13 }}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {data.map((d) => (
                <Cell key={d.date} fill={s.good(d.value) > 0 ? GOOD : s.good(d.value) < 0 ? BAD : NEUTRAL} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

const consistency = (cv) =>
  cv < 0.1 ? ["Steady", "very little swing"] : cv < 0.3 ? ["Some swings", "moderate ups and downs"] : ["Volatile", "big swings between entries"];

/**
 * One series (running total, or one per-period window) for the whole account,
 * with latest / average / lowest / highest and the figures that matter for its kind.
 */
export function MetricPanel({ title, subtitle, points, kpi, kind, target, color, note }) {
  const s = seriesStats(points, kpi);
  if (!s) return null;
  const unit = kpi.unit;
  const whole = ["count", "people", "views"].includes(unit);
  const fa = (v) => fmt(whole ? Math.round(v) : v, unit);
  const isTotal = kind === "total";
  const arrow = s.lowerBetter ? "lower is better" : "";
  const [cons, consSub] = consistency(s.cv);
  const when = (p) => niceDate(p.date);

  return (
    <section className="metric-panel">
      <header className="metric-head">
        <div>
          <h3 className="wizard-subtitle">{title}</h3>
          <small className="muted">
            {subtitle} · {s.n} entr{s.n === 1 ? "y" : "ies"}
            {s.span > 0 ? ` over ${Math.round(s.span)} days` : ""}
            {arrow ? ` · ${arrow}` : ""}
          </small>
        </div>
      </header>
      {note && <p className="muted small">{note}</p>}

      <div className="metric-top">
        <div className="metric-hero">
          <span className="muted small">Latest · {when(s.latest)}</span>
          <strong className="hero-value">{fmt(s.latest.value, unit)}</strong>
          <div className="chip-line">
            <DeltaChip
              value={s.vsPrev}
              good={s.good}
              text={s.vsPrev === null ? "" : `${signed(s.vsPrev, unit)}${s.vsPrevPct !== null && unit !== "%" ? ` (${signedPct(s.vsPrevPct)})` : ""}`}
              label="vs previous"
            />
            {s.n === 1 && <small className="muted">One entry so far</small>}
          </div>
          {s.n > 1 && (
            <div className="hero-spark">
              <Sparkline values={points.map((p) => p.value)} color={s.good(s.vsPrev ?? 0) < 0 ? BAD : "#5d8a6d"} />
            </div>
          )}
        </div>

        <div className="metric-tiles">
          <Tile
            label="Average"
            value={fa(s.avg)}
            sub={
              s.vsAvg === null || s.n < 2
                ? ""
                : `latest ${signedPct(s.vsAvg)} vs avg`
            }
          />
          <Tile
            label="Lowest"
            value={fmt(s.low.value, unit)}
            sub={when(s.low)}
            tone={s.lowerBetter ? "good-text" : ""}
            accent={s.lowerBetter ? "is-best" : ""}
          />
          <Tile
            label="Highest"
            value={fmt(s.high.value, unit)}
            sub={when(s.high)}
            tone={s.lowerBetter ? "" : "good-text"}
            accent={s.lowerBetter ? "" : "is-best"}
          />
          {s.n > 1 && (
            <Tile
              label="Latest ranks"
              value={s.rank === 1 ? "Best yet" : `${ordinal(s.rank)} best`}
              sub={`of ${s.n} entries`}
              tone={s.rank === 1 ? "good-text" : s.rank === s.n ? "bad-text" : ""}
            />
          )}
        </div>
      </div>

      {s.n > 1 && s.high.value !== s.low.value && <RangeMeter s={s} unit={unit} />}

      <TrendChart
        history={points.map((p) => ({ date: p.date, value: p.value }))}
        unit={unit}
        target={target}
        average={s.n > 2 ? s.avg : undefined}
        height={isTotal ? 230 : 200}
        color={color}
      />

      {s.n > 1 && (
        <div className="metric-tiles secondary">
          {isTotal ? (
            <>
              <Tile
                label="Total growth"
                value={s.change === null ? "—" : signed(s.change, unit)}
                sub={s.pct === null || unit === "%" ? `since ${niceDate(s.first.date)}` : `${signedPct(s.pct)} since ${niceDate(s.first.date)}`}
                tone={s.change === null ? "" : toneClass(s.good, s.change)}
              />
              <Tile
                label="Growth per week"
                value={s.perWeek === null ? "—" : signed(s.perWeek, unit)}
                sub={s.pctPerWeek === null || unit === "%" ? "" : `${signedPct(s.pctPerWeek, 2)} per week`}
                tone={s.perWeek === null ? "" : toneClass(s.good, s.perWeek)}
              />
              <Tile
                label="Avg per update"
                value={s.avgStep === null ? "—" : signed(s.avgStep, unit)}
                sub={`${s.positive} of ${s.steps.length} updates improved`}
                tone={s.avgStep === null ? "" : toneClass(s.good, s.avgStep)}
              />
              {s.bestStep && (
                <Tile
                  label="Best update"
                  value={signed(s.bestStep.value, unit)}
                  sub={`${niceDate(s.bestStep.from)} → ${niceDate(s.bestStep.date)}`}
                  tone={toneClass(s.good, s.bestStep.value)}
                />
              )}
              {s.worstStep && s.worstStep !== s.bestStep && (
                <Tile
                  label="Weakest update"
                  value={signed(s.worstStep.value, unit)}
                  sub={`${niceDate(s.worstStep.from)} → ${niceDate(s.worstStep.date)}`}
                  tone={toneClass(s.good, s.worstStep.value)}
                />
              )}
            </>
          ) : (
            <>
              <Tile
                label="Since first entry"
                value={s.change === null ? "—" : signed(s.change, unit)}
                sub={s.pct === null || unit === "%" ? `from ${fmt(s.first.value, unit)}` : `${signedPct(s.pct)} from ${fmt(s.first.value, unit)}`}
                tone={s.change === null ? "" : toneClass(s.good, s.change)}
              />
              {s.momentum && (
                <Tile
                  label="Recent momentum"
                  value={signedPct(s.momentum.pct)}
                  sub={`last ${s.momentum.k} vs the ${s.momentum.k} before`}
                  tone={toneClass(s.good, s.momentum.pct)}
                />
              )}
              {s.n >= 3 && <Tile label="Consistency" value={cons} sub={consSub} />}
              <Tile
                label="Best entry"
                value={fmt(s.best.value, unit)}
                sub={when(s.best)}
                tone="good-text"
              />
              <Tile
                label="Weakest entry"
                value={fmt(s.worst.value, unit)}
                sub={when(s.worst)}
              />
            </>
          )}
        </div>
      )}

      {isTotal && <ChangeBars s={s} unit={unit} />}
    </section>
  );
}

/** Goal as a bar: filled to progress, with a tick where the schedule says it should be. */
export function GoalBar({ goal, campaignName, windowText, kpi, g }) {
  const unit = kpi.unit;
  const pct = Math.max(0, Math.min(100, g.percent));
  const exp = Math.max(0, Math.min(100, g.expectedPercent));
  const tone = !g.hasData ? "neutral" : g.onTrack ? "ok" : "behind";
  return (
    <div className="goal-card">
      <div className="goal-top">
        <strong>
          {campaignName}
          {windowText ? ` · ${windowText}` : ""}
        </strong>
        <span className={`goal-pill ${tone}`}>
          {!g.hasData ? "Awaiting data" : g.onTrack ? "On track" : "Behind pace"}
        </span>
      </div>
      <div className="goal-bar" role="img" aria-label={`${Math.round(g.percent)}% of goal reached, ${Math.round(g.expectedPercent)}% of time used`}>
        <i className={`goal-fill ${tone}`} style={{ width: `${pct}%` }} />
        <i className="goal-expected" style={{ left: `${exp}%` }} title="Where the schedule says you should be" />
      </div>
      <div className="goal-nums">
        <span>
          <small className="muted">Start</small>
          <strong>{fmt(goal.baseline, unit)}</strong>
        </span>
        <span>
          <small className="muted">Now</small>
          <strong>{fmt(g.current, unit)}</strong>
        </span>
        <span>
          <small className="muted">Target</small>
          <strong>{fmt(goal.target, unit)}</strong>
        </span>
        <span>
          <small className="muted">Progress</small>
          <strong className={tone === "behind" ? "warn-text" : "good-text"}>{Math.round(g.percent)}%</strong>
          <small className="muted">{Math.round(g.expectedPercent)}% of time used</small>
        </span>
      </div>
    </div>
  );
}
