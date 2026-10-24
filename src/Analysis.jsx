import { useMemo, useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, Plus } from "lucide-react";
import { today, addDays } from "../shared/domain.mjs";
import {
  channelMeasures,
  channelSeries,
  daysBetween,
  GROUP_DIMENSIONS,
  effectOnChannel,
  groupVideos,
  judge,
  periodSummary,
  splitKey,
  strategyGroups,
  videoMeasures,
  videoRows,
} from "../shared/analysis.mjs";
import { Badge, Empty, Field, Platform, fmt, niceDate, windowLabel } from "./components.jsx";
import { HeadToHead, TheoriesPanel } from "./Tactics.jsx";
import Growth from "./Growth.jsx";

const TONE_COLOR = { green: "#2f7d4f", red: "#c0392b", neutral: "#8a9589" };
const tms = (d) => Date.parse(`${d}T12:00:00Z`);
const labelOf = (m) =>
  m.isVideo
    ? `${m.kpi.name} · ${m.periodDays ? `over ${m.periodDays} days` : "total so far"}`
    : `${m.kpi.name} · ${m.periodDays ? windowLabel(m.periodDays) : "running total"}`;
const signed = (v, unit, digits = 1) =>
  `${v > 0 ? "+" : ""}${fmt(v, unit)}${digits ? "" : ""}`;
const pctText = (p) => (p === null || p === undefined ? "" : `${p > 0 ? "+" : ""}${p.toFixed(1)}%`);

const RANGES = [
  ["4w", "4 weeks", 28],
  ["12w", "12 weeks", 84],
  ["6m", "6 months", 183],
  ["1y", "1 year", 365],
  ["all", "All time", null],
  ["custom", "Custom", null],
];

export default function Analysis({ state, data, openForm, mutate }) {
  const accounts = data.accounts.filter(
    (a) =>
      state.metrics.some((m) => m.accountId === a.id) ||
      state.posts.some((p) => p.accountId === a.id),
  );
  const rank = (a) =>
    state.metrics.filter((m) => m.accountId === a.id).length +
    state.posts.filter((p) => p.accountId === a.id).length * 2 +
    (/youtube/i.test(a.platform) ? 3 : 0);
  const [accountId, setAccountId] = useState(
    [...accounts].sort((a, b) => rank(b) - rank(a))[0]?.id || "",
  );
  const account = accounts.find((a) => a.id === accountId) || accounts[0];
  const chans = useMemo(
    () => (account ? channelMeasures(state, account.id) : []),
    [state, account?.id],
  );
  const vids = useMemo(
    () =>
      account
        ? videoMeasures(state, account.id).map((m) => ({ ...m, isVideo: true }))
        : [],
    [state, account?.id],
  );
  const prefer = (list) =>
    list.find((m) => /view/i.test(m.kpi.name) && m.periodDays === 7) ||
    list.find((m) => /view/i.test(m.kpi.name)) ||
    list[0];
  const [chanKey, setChanKey] = useState("");
  const [vidKey, setVidKey] = useState("");
  const chan = chans.find((m) => m.key === chanKey) || prefer(chans);
  const vid = vids.find((m) => m.key === vidKey) || prefer(vids);

  const [tab, setTab] = useState("growth");
  const [rangeId, setRangeId] = useState("6m");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [tacticFilter, setTacticFilter] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [formatFilter, setFormatFilter] = useState("");
  const [show, setShow] = useState("all"); // all | best | worst | picked
  const [topN, setTopN] = useState(3);
  const [picked, setPicked] = useState([]);
  const [selected, setSelected] = useState("");

  if (!accounts.length)
    return (
      <>
        <Heading />
        <Empty
          icon={BarChart3}
          title="Nothing to analyse yet"
          description="Add a social account, record its numbers, and add your videos to the calendar. They will be compared here."
          action={
            <button className="btn primary" onClick={() => openForm("metric")}>
              <Plus size={15} /> Add numbers
            </button>
          }
        />
      </>
    );

  // ---- time window ----
  const preset = RANGES.find((r) => r[0] === rangeId);
  const allDates = [
    ...state.posts.filter((p) => p.accountId === account.id).map((p) => p.executedAt || p.date),
    ...(chan
      ? channelSeries(state, account.id, chan.kpiId, chan.periodDays).map((p) => p.date)
      : []),
  ].sort();
  let from = "";
  let to = "";
  if (rangeId === "custom") {
    from = customFrom;
    to = customTo;
  } else if (preset[2]) {
    to = today();
    from = addDays(to, -preset[2]);
  } else {
    from = allDates[0] || "";
    to = allDates.at(-1) || "";
  }
  const unit = chan?.kpi.unit;

  // ---- videos ----
  const baseRows = videoRows(state, {
    accountId: account.id,
    from,
    to,
    strategyId,
  }).filter(
    (r) =>
      (!tacticFilter || (r.post.tacticIds || []).includes(tacticFilter)) &&
      (!campaignFilter ||
        (campaignFilter === "__none__"
          ? !r.post.campaignId
          : r.post.campaignId === campaignFilter)) &&
      (!formatFilter || r.post.format === formatFilter),
  );
  const allValues = baseRows
    .map((r) => r.values[vid?.key]?.value)
    .filter((v) => v !== undefined);
  const dir = vid?.kpi.direction;
  const better = (a, b) => (dir === "decrease" ? a < b : a > b);
  const measured = baseRows.filter((r) => r.values[vid?.key]);
  const byBest = [...measured].sort((a, b) =>
    better(a.values[vid.key].value, b.values[vid.key].value) ? -1 : 1,
  );
  let rows = baseRows;
  if (show === "best") {
    const ids = new Set(byBest.slice(0, topN).map((r) => r.post.id));
    rows = baseRows.filter((r) => ids.has(r.post.id));
  } else if (show === "worst") {
    const ids = new Set(byBest.slice(-topN).map((r) => r.post.id));
    rows = baseRows.filter((r) => ids.has(r.post.id));
  } else if (show === "picked") {
    rows = baseRows.filter((r) => picked.includes(r.post.id));
  }
  const verdict = (r) =>
    judge(r.values[vid?.key]?.value, allValues, dir);

  const strategies = state.strategies.filter((s) =>
    state.campaigns.some(
      (c) => c.id === s.campaignId && c.clientId === account.clientId,
    ),
  );

  return (
    <>
      <Heading />
      <section className="panel analysis-bar">
        <label className="field">
          <span>Account</span>
          <select
            value={account.id}
            onChange={(e) => {
              setAccountId(e.target.value);
              setChanKey("");
              setVidKey("");
              setPicked([]);
              setSelected("");
            }}
          >
            {[...new Set(accounts.map((a) => a.clientId))].map((cid) => (
              <optgroup key={cid} label={data.clients?.find((c) => c.id === cid)?.name || "Client"}>
                {accounts
                  .filter((a) => a.clientId === cid)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.platform} · {a.handle}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
        <div className="field">
          <span>Period</span>
          <div className="segmented">
            {RANGES.map(([id, label]) => (
              <button key={id} type="button" className={rangeId === id ? "selected" : ""} onClick={() => setRangeId(id)}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {rangeId === "custom" && (
          <>
            <label className="field">
              <span>From</span>
              <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
            </label>
            <label className="field">
              <span>To</span>
              <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </label>
          </>
        )}
      </section>

      <div className="tabs" role="tablist" aria-label="Analysis views">
        {[
          ["growth", "Growth"],
          ["timeline", "Videos over time"],
          ["compare", "Compare videos"],
          ["groups", "Compare groups"],
          ["tactics", "Tactics"],
          ["periods", "Period vs period"],
        ].map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {tab === "growth" && (
        <Growth {...{ state, account, from, to, openForm }} rangeLabel={preset?.[1] === "Custom" ? "Custom period" : preset?.[1]} />
      )}

      {tab !== "growth" && (
      <section className="panel analysis-controls">
        <div className="filter-bar">
          <label className="field">
            <span>Whole-channel measure</span>
            <select value={chan?.key || ""} onChange={(e) => setChanKey(e.target.value)}>
              {chans.length === 0 && <option value="">No channel numbers yet</option>}
              {chans.map((m) => (
                <option key={m.key} value={m.key}>
                  {labelOf(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Video measure</span>
            <select value={vid?.key || ""} onChange={(e) => setVidKey(e.target.value)}>
              {vids.length === 0 && <option value="">No video numbers yet</option>}
              {vids.map((m) => (
                <option key={m.key} value={m.key}>
                  {labelOf(m)}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Strategy</span>
            <select value={strategyId} onChange={(e) => setStrategyId(e.target.value)}>
              <option value="">All videos</option>
              <option value="none">No strategy</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Campaign</span>
            <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)}>
              <option value="">All campaigns</option>
              <option value="__none__">No campaign</option>
              {state.campaigns
                .filter((c) => c.clientId === account.clientId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>Content type</span>
            <select value={formatFilter} onChange={(e) => setFormatFilter(e.target.value)}>
              <option value="">All types</option>
              {["Video", "Reel", "Post", "Carousel", "Story", "Article"].map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Tactic</span>
            <select value={tacticFilter} onChange={(e) => setTacticFilter(e.target.value)}>
              <option value="">Any tactic</option>
              {state.tactics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Show videos</span>
            <select value={show} onChange={(e) => setShow(e.target.value)}>
              <option value="all">All in this period</option>
              <option value="best">Best by video measure</option>
              <option value="worst">Lowest by video measure</option>
              <option value="picked">Only the ones I pick</option>
            </select>
          </label>
          {(show === "best" || show === "worst") && (
            <label className="field">
              <span>How many</span>
              <input
                type="number"
                min="1"
                max="50"
                value={topN}
                onChange={(e) => setTopN(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>
          )}
        </div>
        {show === "picked" && (
          <div className="chip-row">
            {baseRows.map((r) => (
              <button
                key={r.post.id}
                type="button"
                className={`chip ${picked.includes(r.post.id) ? "on" : ""}`}
                aria-pressed={picked.includes(r.post.id)}
                onClick={() =>
                  setPicked((l) =>
                    l.includes(r.post.id) ? l.filter((x) => x !== r.post.id) : [...l, r.post.id],
                  )
                }
              >
                {r.post.title}
              </button>
            ))}
            {!baseRows.length && <span className="muted small">No videos in this period.</span>}
          </div>
        )}
        <p className="muted small">
          {rows.length} video{rows.length === 1 ? "" : "s"} shown
          {from && to ? ` · ${niceDate(from, { month: "short", day: "numeric", year: "numeric" })} to ${niceDate(to, { month: "short", day: "numeric", year: "numeric" })}` : ""}
          . Comparisons describe what moved together, not proof of cause.
        </p>
      </section>
      )}

      {tab === "timeline" && (
        <Timeline
          {...{ state, account, chan, vid, from, to, rows, verdict, unit, selected, setSelected, openForm, allValues }}
        />
      )}
      {tab === "compare" && (
        <Compare {...{ state, account, vids, vid, rows, verdict, dir, setVidKey, openForm }} />
      )}
      {tab === "tactics" && (
        <>
          <section className="panel">
            <h3>
              Tactic theories <small className="muted">· {vid ? labelOf(vid) : "choose a video measure"}</small>
            </h3>
            <TheoriesPanel state={state} account={account} measure={vid?.key} from={from} to={to} mutate={mutate} />
          </section>
          <section className="panel">
            <h3>Compare two tactics head to head</h3>
            <HeadToHead state={state} account={account} measure={vid?.key} from={from} to={to} />
          </section>
        </>
      )}
      {tab === "groups" && (
        <Groups {...{ state, vid, vids, baseRows, setVidKey, dir }} />
      )}
      {tab === "periods" && (
        <Periods {...{ state, account, chan, vid, chans, vids }} />
      )}
    </>
  );
}

function Heading() {
  return (
    <div className="page-heading">
      <div>
        <h1>Analysis</h1>
        <p className="muted">
          How each account is growing against its earlier performance, and
          which videos, strategies and tactics went with it.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Channel timeline with video markers ---------------- */
function Timeline({ state, account, chan, vid, from, to, rows, verdict, unit, selected, setSelected, openForm, allValues }) {
  const series = chan
    ? channelSeries(state, account.id, chan.kpiId, chan.periodDays).filter(
        (p) => (!from || p.date >= from) && (!to || p.date <= to),
      )
    : [];
  const sel = rows.find((r) => r.post.id === selected);
  const effect = sel && chan ? effectOnChannel(state, sel.post, account.id, chan) : null;
  const start = from || series[0]?.date;
  const end = to || series.at(-1)?.date;
  const dir = chan?.kpi.direction === "decrease" ? -1 : 1;
  const vidMeasuresShown = videoMeasures(state, account.id).map((m) => ({
    ...m,
    isVideo: true,
  }));
  return (
    <>
      <section className="panel">
        <h3>
          {chan ? labelOf(chan) : "Whole channel"}{" "}
          <small className="muted">· whole account, with video uploads marked</small>
        </h3>
        {!series.length ? (
          <p className="muted">
            No whole-channel numbers for this measure in this period. Record them with
            Add numbers (leave Post empty).
          </p>
        ) : (
          <div style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series.map((p) => ({ t: tms(p.date), value: p.value }))} margin={{ top: 22, right: 20, bottom: 0, left: 2 }}>
                <CartesianGrid vertical={false} stroke="#edf0ed" strokeDasharray="3 4" />
                <XAxis
                  dataKey="t"
                  type="number"
                  scale="time"
                  domain={[start ? tms(start) : "auto", end ? tms(end) : "auto"]}
                  tickFormatter={(t) => niceDate(new Date(t).toISOString().slice(0, 10))}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#5f6b5d", fontSize: 12 }}
                />
                <YAxis axisLine={false} tickLine={false} width={60} tick={{ fill: "#5f6b5d", fontSize: 12 }} tickFormatter={(v) => fmt(v, unit)} domain={["auto", "auto"]} />
                <Tooltip
                  labelFormatter={(t) => niceDate(new Date(t).toISOString().slice(0, 10), { month: "short", day: "numeric", year: "numeric" })}
                  formatter={(v) => [fmt(v, unit), chan ? labelOf(chan) : ""]}
                  contentStyle={{ border: "1px solid #e4e9e4", borderRadius: 10, fontSize: 13 }}
                />
                <Line type="linear" dataKey="value" stroke="#668873" strokeWidth={2.5} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
                {rows.map((r, i) => {
                  const v = verdict(r);
                  const color = TONE_COLOR[v.tone];
                  return (
                    <ReferenceLine
                      key={r.post.id}
                      x={tms(r.upload)}
                      stroke={color}
                      strokeWidth={selected === r.post.id ? 3 : 1.5}
                      strokeDasharray={vid && r.values[vid.key] ? "" : "4 3"}
                      label={{ value: String(i + 1), position: "top", fill: color, fontSize: 12, fontWeight: 700 }}
                    />
                  );
                })}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
        <p className="muted small">
          Each numbered line is a video upload. <span className="good-text">Green</span> = above your typical
          {vid ? ` ${labelOf(vid)}` : " result"}, <span className="bad-text">red</span> = below, grey = typical or not enough
          videos to judge (needs 3 or more with numbers). Dashed = no numbers recorded for that video yet. Stretches
          with no line are periods with no upload.
        </p>
      </section>

      <section className="panel">
        <h3>Videos in this period</h3>
        {!rows.length ? (
          <p className="muted">No videos in this period. Add one from the Content calendar.</p>
        ) : (
          <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Video</th>
                <th>Uploaded</th>
                <th>{vid ? labelOf(vid) : "Result"}</th>
                <th>Verdict</th>
                <th>Channel after vs before</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const v = verdict(r);
                const e = chan ? effectOnChannel(state, r.post, account.id, chan) : null;
                const good = e?.ok && e.pct !== null ? e.pct * dir >= 0 : null;
                return (
                  <tr key={r.post.id} className={selected === r.post.id ? "row-selected" : ""} onClick={() => setSelected(selected === r.post.id ? "" : r.post.id)} style={{ cursor: "pointer" }}>
                    <td>{i + 1}</td>
                    <td>
                      {r.post.title}
                      {(r.post.tacticIds || []).length > 0 && (
                        <div className="chip-row tag-row">
                          {r.post.tacticIds.map((id) => (
                            <small className="tag" key={id}>
                              {state.tactics.find((t) => t.id === id)?.name}
                            </small>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>{niceDate(r.upload, { month: "short", day: "numeric", year: "numeric" })}</td>
                    <td>{vid && r.values[vid.key] ? fmt(r.values[vid.key].value, vid.kpi.unit) : <span className="muted">no numbers</span>}</td>
                    <td>
                      <Badge tone={v.tone}>{v.label}</Badge>
                      {v.vsMedian != null && r.values[vid.key] && <small className="muted"> {pctText(v.vsMedian)} vs typical</small>}
                    </td>
                    <td>
                      {!e ? "—" : e.ok ? (
                        <>
                          <Badge tone={e.pct === null ? "neutral" : good ? "green" : "red"}>{pctText(e.pct) || "n/a"}</Badge>
                          {e.overlaps > 0 && <small className="muted"> · {e.overlaps} other upload{e.overlaps === 1 ? "" : "s"} in that window</small>}
                        </>
                      ) : (
                        <small className="muted">{e.reason}</small>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        )}
        <p className="muted small">
          “Channel after vs before” compares the average of the 2 whole periods before the upload day with the 2 whole
          periods after it, leaving out the period the video landed in. Click a row for details.
        </p>
      </section>

      {sel && (
        <section className="panel">
          <h3>
            {sel.post.title}{" "}
            <small className="muted">· uploaded {niceDate(sel.upload, { month: "short", day: "numeric", year: "numeric" })}</small>
          </h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Video KPI</th>
                  <th>Value</th>
                  <th>Typical (median of your videos)</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {vidMeasuresShown.map((m) => {
                  const val = sel.values[m.key];
                  const all = videoRows(state, { accountId: account.id }).map((r) => r.values[m.key]?.value).filter((x) => x !== undefined);
                  const j = judge(val?.value, all, m.kpi.direction);
                  const med = all.length ? [...all].sort((a, b) => a - b)[Math.floor(all.length / 2)] : null;
                  return (
                    <tr key={m.key}>
                      <td>{labelOf(m)}</td>
                      <td>{val ? fmt(val.value, m.kpi.unit) : "—"}</td>
                      <td>{med === null ? "—" : fmt(med, m.kpi.unit)}</td>
                      <td>{val ? <Badge tone={j.tone}>{j.label}</Badge> : <span className="muted">not recorded</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {effect?.ok && chan && (
            <p>
              <strong>Whole channel ({labelOf(chan)}):</strong> {fmt(effect.beforeAvg, unit)} before →{" "}
              {fmt(effect.afterAvg, unit)} after ({effect.change > 0 ? "+" : ""}
              {fmt(effect.change, unit)}
              {effect.pct !== null ? `, ${pctText(effect.pct)}` : ""}). Based on {effect.before.length} period
              {effect.before.length === 1 ? "" : "s"} before and {effect.after.length} after.
              {effect.overlaps > 0 ? ` ${effect.overlaps} other upload(s) fall in the after window, so this can't be credited to this video alone.` : ""}
            </p>
          )}
          <div className="dialog-footer">
            <button
              className="btn secondary"
              onClick={() =>
                openForm("metric", null, {
                  accountId: sel.post.accountId,
                  campaignId: sel.post.campaignId,
                  strategyId: sel.post.strategyId || "",
                  postId: sel.post.id,
                  periodDays: "7",
                })
              }
            >
              <Plus size={15} /> Add results for this video
            </button>
          </div>
        </section>
      )}
    </>
  );
}

/* ---------------- Compare videos ---------------- */
function Compare({ state, account, vids, vid, rows, verdict, dir, setVidKey, openForm }) {
  const shownMeasures = vids;
  const best = (m) => {
    const vals = rows.map((r) => r.values[m.key]?.value).filter((v) => v !== undefined);
    if (vals.length < 2) return {};
    return m.kpi.direction === "decrease"
      ? { best: Math.min(...vals), worst: Math.max(...vals) }
      : { best: Math.max(...vals), worst: Math.min(...vals) };
  };
  const sorted = [...rows].sort((a, b) => {
    const av = a.values[vid?.key]?.value;
    const bv = b.values[vid?.key]?.value;
    if (av === undefined) return 1;
    if (bv === undefined) return -1;
    return dir === "decrease" ? av - bv : bv - av;
  });
  const max = Math.max(...rows.map((r) => r.values[vid?.key]?.value ?? 0), 1);
  if (!rows.length)
    return (
      <section className="panel">
        <p className="muted">No videos match these filters. Change the period, strategy or “Show videos” choice above.</p>
      </section>
    );
  return (
    <section className="panel">
      <h3>
        Videos side by side <small className="muted">· ranked by {vid ? labelOf(vid) : "…"} ({dir === "decrease" ? "lower is better" : "higher is better"})</small>
      </h3>
      <div className="chip-row">
        {vids.map((m) => (
          <button key={m.key} type="button" className={`chip ${vid?.key === m.key ? "on" : ""}`} aria-pressed={vid?.key === m.key} onClick={() => setVidKey(m.key)}>
            {labelOf(m)}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Video</th>
              <th>Uploaded</th>
              <th>Strategy</th>
              <th>Tactics</th>
              {shownMeasures.map((m) => (
                <th key={m.key}>{labelOf(m)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => (
              <tr key={r.post.id}>
                <td>
                  {r.post.title} {r.values[vid?.key] && <Badge tone={verdict(r).tone}>{verdict(r).label}</Badge>}
                </td>
                <td>{niceDate(r.upload, { month: "short", day: "numeric", year: "numeric" })}</td>
                <td>{state.strategies.find((s) => s.id === r.post.strategyId)?.name || <span className="muted">none</span>}</td>
                <td>
                  {(r.post.tacticIds || []).map((id) => state.tactics.find((t) => t.id === id)?.name).filter(Boolean).join(", ") || <span className="muted">none</span>}
                </td>
                {shownMeasures.map((m) => {
                  const v = r.values[m.key]?.value;
                  const b = best(m);
                  return (
                    <td key={m.key} className={v !== undefined && v === b.best ? "good-text" : v !== undefined && v === b.worst ? "bad-text" : ""}>
                      {v === undefined ? "—" : <strong>{fmt(v, m.kpi.unit)}</strong>}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted small">Best value per column in green, lowest in red (flipped for KPIs where lower is better). Only compare videos measured over the same window.</p>
      {vid && (
        <>
          <h4>{labelOf(vid)}</h4>
          {sorted.map((r) => {
            const v = r.values[vid.key]?.value;
            return (
              <div className="video-row" key={r.post.id}>
                <span title={r.post.title}>{r.post.title}</span>
                <span className="video-bar">
                  <i style={{ width: `${v === undefined ? 0 : Math.max(2, (v / max) * 100)}%` }} />
                </span>
                <strong>{v === undefined ? "—" : fmt(v, vid.kpi.unit)}</strong>
                <small className="muted">{niceDate(r.upload)}</small>
              </div>
            );
          })}
        </>
      )}
    </section>
  );
}

/* ---------------- Compare groups: campaign, strategy, tactic, type, time ---------------- */
function Groups({ state, vid, vids, baseRows, setVidKey, dir }) {
  const [dimension, setDimension] = useState("tactic");
  const [by, setBy] = useState("median");
  const groups = vid ? groupVideos(state, baseRows, dimension, vid.key) : [];
  groups.sort((a, b) => (dir === "decrease" ? a[by] - b[by] : b[by] - a[by]));
  const max = Math.max(...groups.map((g) => g[by]), 1);
  return (
    <section className="panel">
      <h3>
        Compare groups <small className="muted">· {vid ? labelOf(vid) : "choose a video measure"}</small>
      </h3>
      <div className="chip-row">
        {GROUP_DIMENSIONS.map(([id, label]) => (
          <button key={id} type="button" className={`chip ${dimension === id ? "on" : ""}`} aria-pressed={dimension === id} onClick={() => setDimension(id)}>
            {label}
          </button>
        ))}
      </div>
      <div className="chip-row">
        {vids.map((m) => (
          <button key={m.key} type="button" className={`chip ${vid?.key === m.key ? "on" : ""}`} aria-pressed={vid?.key === m.key} onClick={() => setVidKey(m.key)}>
            {labelOf(m)}
          </button>
        ))}
        <span className="segmented">
          <button type="button" className={by === "median" ? "selected" : ""} onClick={() => setBy("median")}>Median</button>
          <button type="button" className={by === "avg" ? "selected" : ""} onClick={() => setBy("avg")}>Average</button>
        </span>
      </div>
      {!groups.length ? (
        <p className="muted">No videos with this measure match the filters above.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>{GROUP_DIMENSIONS.find(([id]) => id === dimension)?.[1]}</th>
                <th>Videos</th>
                <th>Median</th>
                <th>Average</th>
                <th>Best</th>
                <th>Lowest</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.name}</td>
                  <td>
                    {g.n} {g.n < 3 && <small className="muted">· small sample</small>}
                  </td>
                  <td><strong>{fmt(g.median, vid.kpi.unit)}</strong></td>
                  <td>{fmt(g.avg, vid.kpi.unit)}</td>
                  <td>{g.best.title} <small className="muted">{fmt(g.best.value, vid.kpi.unit)}</small></td>
                  <td>{g.worst.title} <small className="muted">{fmt(g.worst.value, vid.kpi.unit)}</small></td>
                  <td style={{ width: "18%" }}>
                    <span className="video-bar"><i style={{ width: `${Math.max(2, (g[by] / max) * 100)}%` }} /></span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Uses the videos left after the filters above. With tactics, one video can appear in several groups. Small groups are hints, not conclusions.
        To go from a pattern to a proven tactic, use the Tactics lab.
      </p>
    </section>
  );
}

/* ---------------- Strategies ---------------- */
function Strategies({ state, vid, baseRows, vids, setVidKey, dir }) {
  const groups = vid ? strategyGroups(baseRows, vid.key, state.strategies) : [];
  groups.sort((a, b) => (dir === "decrease" ? a.avg - b.avg : b.avg - a.avg));
  const max = Math.max(...groups.map((g) => g.avg), 1);
  return (
    <section className="panel">
      <h3>
        Strategies compared <small className="muted">· average {vid ? labelOf(vid) : "result"} per video</small>
      </h3>
      <div className="chip-row">
        {vids.map((m) => (
          <button key={m.key} type="button" className={`chip ${vid?.key === m.key ? "on" : ""}`} aria-pressed={vid?.key === m.key} onClick={() => setVidKey(m.key)}>
            {labelOf(m)}
          </button>
        ))}
      </div>
      {!groups.length ? (
        <p className="muted">No videos with this measure in the chosen period.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Strategy</th>
              <th>Videos</th>
              <th>Average</th>
              <th>Median</th>
              <th>Best video</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.id}>
                <td>{g.name}</td>
                <td>
                  {g.n} {g.n < 3 && <small className="muted">· small sample</small>}
                </td>
                <td>
                  <strong>{fmt(g.avg, vid.kpi.unit)}</strong>
                </td>
                <td>{fmt(g.median, vid.kpi.unit)}</td>
                <td>
                  {g.best.title} <small className="muted">{fmt(g.best.value, vid.kpi.unit)}</small>
                </td>
                <td style={{ width: "22%" }}>
                  <span className="video-bar">
                    <i style={{ width: `${Math.max(2, (g.avg / max) * 100)}%` }} />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted small">With only a few videos per strategy, differences can come from the topic, timing or luck. Treat small samples as hints to test again.</p>
    </section>
  );
}

/* ---------------- Period vs period ---------------- */
function Periods({ state, account, chan, vid }) {
  const end = today();
  const [bFrom, setBFrom] = useState(addDays(end, -27));
  const [bTo, setBTo] = useState(end);
  const [aFrom, setAFrom] = useState(addDays(end, -55));
  const [aTo, setATo] = useState(addDays(end, -28));
  const args = (from, to) => ({ accountId: account.id, from, to, channel: chan || { kpiId: "", periodDays: 0 }, video: vid?.key || "" });
  const A = chan ? periodSummary(state, args(aFrom, aTo)) : null;
  const B = chan ? periodSummary(state, args(bFrom, bTo)) : null;
  const dirv = chan?.kpi.direction === "decrease" ? -1 : 1;
  const change = (a, b) => (a === null || b === null || a === 0 ? null : ((b - a) / Math.abs(a)) * 100);
  const row = (label, a, b, f, tone = true) => {
    const p = a === null || a === undefined || b === null || b === undefined ? null : change(a, b);
    return (
      <tr key={label}>
        <td>{label}</td>
        <td>{a === null || a === undefined ? "—" : f(a)}</td>
        <td>{b === null || b === undefined ? "—" : f(b)}</td>
        <td>{p === null ? "—" : <Badge tone={!tone ? "neutral" : p * dirv >= 0 ? "green" : "red"}>{pctText(p)}</Badge>}</td>
      </tr>
    );
  };
  return (
    <section className="panel">
      <h3>Period vs period</h3>
      <div className="filter-bar">
        <Field label="Period A from">
          <input type="date" value={aFrom} onChange={(e) => setAFrom(e.target.value)} />
        </Field>
        <Field label="Period A to">
          <input type="date" value={aTo} onChange={(e) => setATo(e.target.value)} />
        </Field>
        <Field label="Period B from">
          <input type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)} />
        </Field>
        <Field label="Period B to">
          <input type="date" value={bTo} onChange={(e) => setBTo(e.target.value)} />
        </Field>
      </div>
      {!chan ? (
        <p className="muted">Record whole-channel numbers first to compare periods.</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th>
                A · {niceDate(aFrom)} to {niceDate(aTo)} ({daysBetween(aFrom, aTo) + 1} days)
              </th>
              <th>
                B · {niceDate(bFrom)} to {niceDate(bTo)} ({daysBetween(bFrom, bTo) + 1} days)
              </th>
              <th>Change A → B</th>
            </tr>
          </thead>
          <tbody>
            {row(`${labelOf(chan)} (${A?.channelNote || B?.channelNote || "average"})`, A.channelValue, B.channelValue, (v) => fmt(v, chan.kpi.unit))}
            {row("Videos uploaded", A.uploads, B.uploads, (v) => v, false)}
            {vid && row(`Average ${labelOf(vid)} per video`, A.videoAvg, B.videoAvg, (v) => fmt(v, vid.kpi.unit))}
            {row("Channel data points used", A.points, B.points, (v) => v, false)}
          </tbody>
        </table>
      )}
      <p className="muted small">Periods of different lengths are not like-for-like. Keep A and B the same number of days, and remember an upload in one period may affect the next.</p>
    </section>
  );
}
