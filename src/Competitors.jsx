import React, { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  ExternalLink,
  ListPlus,
  Minus,
  Pencil,
  Plus,
  Radar,
  Repeat,
  Sparkles,
  Trash2,
} from "lucide-react";
import {
  Avatar,
  Badge,
  Dialog,
  Empty,
  Field,
  PanelHeader,
  Platform,
  niceDate,
  titleCase,
  uid,
} from "./components.jsx";
import { today, addDays } from "../shared/domain.mjs";
import {
  METRICS,
  STALE_AFTER_DAYS,
  benchmarkTable,
  gapInsights,
  platformsFor,
  snapshots,
} from "../shared/competitors.mjs";

const TABS = [
  ["landscape", "1 · Landscape"],
  ["benchmarks", "2 · Benchmarks"],
  ["intel", "3 · Intel log"],
  ["gaps", "4 · Gaps & actions"],
];
const TIERS = {
  direct: {
    label: "Direct",
    hint: "Same audience, same offer. Track 3–5.",
  },
  indirect: {
    label: "Indirect",
    hint: "Different offer, same audience or need. Track 1–2.",
  },
  aspirational: {
    label: "Aspirational",
    hint: "Best in class, even if bigger. Learn from 1.",
  },
};
const THREAT_TONE = { high: "red", medium: "amber", low: "neutral" };
const CATEGORIES = {
  content: "Content",
  messaging: "Messaging",
  campaign: "Campaign",
  product: "Product",
  pricing: "Pricing",
  other: "Other",
};
const PLATFORM_SUGGESTIONS = [
  "Instagram",
  "TikTok",
  "YouTube",
  "LinkedIn",
  "Facebook",
  "X",
  "Newsletter",
  "Website",
];
const compact = (n) =>
  n === null || n === undefined
    ? "—"
    : new Intl.NumberFormat("en", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
const pct = (n, digits = 1) =>
  n === null || n === undefined ? "—" : `${Number(n.toFixed(digits))}%`;
const num = (text) => {
  const t = String(text ?? "").trim();
  if (!t) return undefined;
  const n = Number(t.replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
};
const link = (url) => {
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`);
    return ["http:", "https:"].includes(u.protocol) ? u.href : null;
  } catch {
    return null;
  }
};

export default function CompetitorsPage({
  state,
  data,
  mutateMany,
  askClaude,
}) {
  const [tab, setTab] = useState("landscape");
  const [dialog, setDialog] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(operations, message) {
    setBusy(true);
    setError("");
    try {
      await mutateMany(operations, undefined, message);
      return true;
    } catch (failure) {
      setError(failure.message || "Unable to save this change.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const first = data.clients[0];
  const total = (state.competitors || []).filter((c) =>
    data.clients.some((client) => client.id === c.clientId),
  ).length;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Competitor analysis</h1>
          <p className="muted">
            Map who you compete with, benchmark them, log their moves and turn
            the gaps into your next tests. Numbers are snapshots you enter from
            public profiles; nothing is pulled from the networks.
          </p>
        </div>
        <div className="heading-actions">
          <button
            className="btn secondary"
            disabled={!first}
            onClick={() => setDialog({ type: "intel", clientId: first.id })}
          >
            <Plus size={16} /> Log intel
          </button>
          <button
            className="btn primary"
            disabled={!first}
            onClick={() => setDialog({ type: "competitor", clientId: first.id })}
          >
            <Plus size={17} /> Add competitor
          </button>
        </div>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="tabs" role="tablist" aria-label="Competitor analysis steps">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {!data.clients.length && (
        <Empty
          icon={Radar}
          title="Add a client first"
          description="Competitors are tracked per client so their benchmarks compare with the right accounts."
        />
      )}
      {data.clients.map((client) => (
        <ClientBlock
          key={client.id}
          client={client}
          showName={data.clients.length > 1}
          state={state}
          tab={tab}
          empty={total === 0}
          busy={busy}
          run={run}
          askClaude={askClaude}
          open={(next) => setDialog({ clientId: client.id, ...next })}
        />
      ))}
      {dialog?.type === "competitor" && (
        <CompetitorForm
          key={dialog.value?.id || "new"}
          state={state}
          dialog={dialog}
          busy={busy}
          onClose={() => setDialog(null)}
          run={run}
        />
      )}
      {dialog?.type === "benchmark" && (
        <BenchmarkForm
          key={dialog.value?.id || "new"}
          state={state}
          dialog={dialog}
          busy={busy}
          onClose={() => setDialog(null)}
          run={run}
        />
      )}
      {dialog?.type === "intel" && (
        <IntelForm
          key={dialog.value?.id || "new"}
          state={state}
          dialog={dialog}
          busy={busy}
          onClose={() => setDialog(null)}
          run={run}
        />
      )}
    </>
  );
}

function ClientBlock({ client, showName, state, tab, empty, ...props }) {
  const competitors = (state.competitors || []).filter(
    (c) => c.clientId === client.id,
  );
  return (
    <section className="brand-section competitor-block">
      {showName && (
        <div className="brand-section-heading">
          <Avatar client={client} />
          <div>
            <h2>{client.name}</h2>
            <span className="muted small">
              {competitors.length}{" "}
              {competitors.length === 1 ? "competitor" : "competitors"} tracked
            </span>
          </div>
          <button
            className="btn ghost small"
            onClick={() => props.open({ type: "competitor" })}
          >
            <Plus size={14} /> Add competitor
          </button>
        </div>
      )}
      {!competitors.length && tab !== "intel" ? (
        <Empty
          icon={Radar}
          title={`No competitors tracked${showName ? ` for ${client.name}` : ""} yet`}
          description="Start with 3–5 direct competitors, 1–2 indirect and one aspirational brand you would like to learn from."
          action={
            <button
              className="btn primary"
              onClick={() => props.open({ type: "competitor" })}
            >
              <Plus size={16} /> Add the first competitor
            </button>
          }
        />
      ) : tab === "landscape" ? (
        <Landscape
          state={state}
          client={client}
          competitors={competitors}
          {...props}
        />
      ) : tab === "benchmarks" ? (
        <Benchmarks
          state={state}
          client={client}
          competitors={competitors}
          {...props}
        />
      ) : tab === "intel" ? (
        <IntelLog
          state={state}
          client={client}
          competitors={competitors}
          {...props}
        />
      ) : (
        <Gaps
          state={state}
          client={client}
          competitors={competitors}
          {...props}
        />
      )}
    </section>
  );
}

/* 1 · Landscape: who competes with you, and how they position themselves. */
function Landscape({ state, competitors, open }) {
  const counts = Object.fromEntries(
    Object.keys(TIERS).map((t) => [
      t,
      competitors.filter((c) => c.tier === t).length,
    ]),
  );
  return (
    <>
      <div className="comp-coverage">
        {Object.entries(TIERS).map(([tier, t]) => (
          <div key={tier}>
            <strong>
              {counts[tier]} {t.label.toLowerCase()}
            </strong>
            <span>{t.hint}</span>
          </div>
        ))}
      </div>
      {Object.entries(TIERS).map(([tier, t]) => {
        const list = competitors.filter((c) => c.tier === tier);
        if (!list.length) return null;
        return (
          <div key={tier} className="comp-tier">
            <h3>
              {t.label} competitors <span>{list.length}</span>
            </h3>
            <div className="comp-grid">
              {list.map((c) => (
                <CompetitorCard
                  key={c.id}
                  competitor={c}
                  state={state}
                  onEdit={() => open({ type: "competitor", value: c })}
                  onBenchmark={() =>
                    open({ type: "benchmark", competitorId: c.id })
                  }
                />
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}

function CompetitorCard({ competitor: c, state, onEdit, onBenchmark }) {
  const dates = (state.benchmarks || [])
    .filter((b) => b.competitorId === c.id)
    .map((b) => b.date)
    .sort();
  const last = dates.at(-1);
  const stale = !last || last < addDays(today(), -STALE_AFTER_DAYS);
  const site = c.website ? link(c.website) : null;
  return (
    <article className="comp-card">
      <header>
        <div>
          <h4>{c.name}</h4>
          {site && (
            <a href={site} target="_blank" rel="noreferrer noopener">
              {c.website.replace(/^https?:\/\//i, "").replace(/\/$/, "")}{" "}
              <ExternalLink size={11} />
            </a>
          )}
        </div>
        <Badge tone={THREAT_TONE[c.threat]}>{titleCase(c.threat)} threat</Badge>
      </header>
      {c.positioning && <p className="comp-positioning">{c.positioning}</p>}
      <dl>
        {c.audience && (
          <>
            <dt>Audience</dt>
            <dd>{c.audience}</dd>
          </>
        )}
        {c.offer && (
          <>
            <dt>Offer & pricing</dt>
            <dd>{c.offer}</dd>
          </>
        )}
      </dl>
      <div className="comp-sw">
        <div>
          <b className="green-text">Strengths</b>
          <p>{c.strengths || "Not noted yet"}</p>
        </div>
        <div>
          <b className="amber-text">Weaknesses</b>
          <p>{c.weaknesses || "Not noted yet"}</p>
        </div>
      </div>
      {c.channels.length > 0 && (
        <div className="comp-channels">
          {c.channels.map((ch, i) => (
            <span key={i}>
              <Platform platform={ch.platform} size={12} />
              {ch.handle || ch.platform}
            </span>
          ))}
        </div>
      )}
      <footer>
        <span className={stale ? "amber-text" : "muted"}>
          {last
            ? `Numbers ${niceDate(last)}${stale ? " · due for a refresh" : ""}`
            : "No numbers recorded yet"}
        </span>
        <span>
          <button className="btn ghost small" onClick={onBenchmark}>
            <Plus size={13} /> Numbers
          </button>
          <button
            className="btn ghost small"
            onClick={onEdit}
            aria-label={`Edit ${c.name}`}
          >
            <Pencil size={13} /> Edit
          </button>
        </span>
      </footer>
    </article>
  );
}

/* 2 · Benchmarks: the same few numbers, same platform, side by side. */
function Benchmarks({ state, client, competitors, open, run, busy }) {
  const platforms = platformsFor(state, client.id);
  const [chosen, setChosen] = useState("");
  const platform = platforms.includes(chosen) ? chosen : platforms[0] || "";
  const table = useMemo(
    () => (platform ? benchmarkTable(state, client.id, platform) : null),
    [state, client.id, platform],
  );
  const rows = [
    ...(table?.you ? [{ you: true, name: "You", ...table.you }] : []),
    ...(table?.rows || []).map((r) => ({ ...r, name: r.competitor.name })),
  ];
  const chart = (key) =>
    rows
      .filter((r) => r[key] !== null && r[key] !== undefined)
      .map((r) => ({ name: r.name, value: r[key], you: Boolean(r.you) }));

  return (
    <>
      <div className="comp-toolbar">
        <label className="comp-platform">
          <span>Platform</span>
          <select value={platform} onChange={(e) => setChosen(e.target.value)}>
            {platforms.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <p className="muted">
          Compare like with like: one platform, the same measure, ideally on
          the same day. Your row comes from your tracked accounts and posts.
        </p>
        <button
          className="btn secondary"
          onClick={() => open({ type: "benchmark", platform })}
        >
          <Plus size={16} /> Add numbers
        </button>
      </div>
      {!table || !table.rows.length ? (
        <Empty
          icon={Radar}
          title="No competitor numbers on this platform yet"
          description="Record audience size, posting pace and engagement rate from each competitor's public profile."
        />
      ) : (
        <>
          <section className="panel">
            <PanelHeader
              title={`${platform} benchmark`}
              description={`Share of audience is each account's slice of everyone listed here. Rows older than ${STALE_AFTER_DAYS} days are flagged.`}
            />
            <div className="table-wrap">
              <table className="data-table comp-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Audience</th>
                    <th>Share</th>
                    <th>Change</th>
                    <th>Posts / week</th>
                    <th>Engagement</th>
                    <th>As of</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.you ? "you" : r.competitor.id} className={r.you ? "you-row" : ""}>
                      <td>
                        <strong>{r.name}</strong>
                        {!r.you && (
                          <small>{TIERS[r.competitor.tier].label}</small>
                        )}
                      </td>
                      <td>{compact(r.followers)}</td>
                      <td>{pct(r.share, 0)}</td>
                      <td>
                        <Change value={r.growthPct} />
                      </td>
                      <td>{r.postsPerWeek === null ? "—" : Number(r.postsPerWeek.toFixed(1))}</td>
                      <td>{pct(r.engagementRate)}</td>
                      <td className={r.stale ? "amber-text" : ""}>
                        {r.date ? niceDate(r.date) : "—"}
                        {r.stale && " · stale"}
                      </td>
                    </tr>
                  ))}
                  <tr className="median-row">
                    <td>
                      <strong>Competitor median</strong>
                    </td>
                    <td>{compact(table.medians.followers)}</td>
                    <td />
                    <td />
                    <td>
                      {table.medians.postsPerWeek === null
                        ? "—"
                        : Number(table.medians.postsPerWeek.toFixed(1))}
                    </td>
                    <td>{pct(table.medians.engagementRate)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <div className="comp-charts">
            {[
              ["followers", "Audience size", compact],
              ["engagementRate", "Engagement rate", (v) => pct(v)],
              ["postsPerWeek", "Posts per week", (v) => Number(v.toFixed(1))],
            ].map(([key, title, format]) => {
              const series = chart(key);
              return (
                <section className="panel" key={key}>
                  <PanelHeader title={title} />
                  {series.length ? (
                    <ResponsiveContainer width="100%" height={Math.max(150, series.length * 38)}>
                      <BarChart data={series} layout="vertical" margin={{ left: 8, right: 16 }}>
                        <CartesianGrid horizontal={false} stroke="#edf1e6" />
                        <XAxis type="number" tickFormatter={format} fontSize={11} stroke="#a3b093" />
                        <YAxis type="category" dataKey="name" width={96} fontSize={11} stroke="#6a7a5d" />
                        <Tooltip formatter={(v) => format(v)} cursor={{ fill: "#f4f8ee" }} />
                        <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                          {series.map((s) => (
                            <Cell key={s.name} fill={s.you ? "#375638" : "#a9bf98"} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  ) : (
                    <p className="muted">No numbers for this measure.</p>
                  )}
                </section>
              );
            })}
          </div>
          <BenchmarkHistory
            state={state}
            competitors={competitors}
            platform={platform}
            open={open}
            run={run}
            busy={busy}
          />
        </>
      )}
    </>
  );
}

function Change({ value }) {
  if (value === null || value === undefined)
    return <span className="muted">—</span>;
  const Icon = value > 0.05 ? ArrowUpRight : value < -0.05 ? ArrowDownRight : Minus;
  return (
    <span className={value > 0.05 ? "green-text" : value < -0.05 ? "amber-text" : "muted"}>
      <Icon size={12} /> {pct(Math.abs(value))}
    </span>
  );
}

function BenchmarkHistory({ state, competitors, platform, open, run, busy }) {
  const ids = new Set(competitors.map((c) => c.id));
  const entries = (state.benchmarks || [])
    .filter(
      (b) =>
        ids.has(b.competitorId) &&
        b.platform.toLowerCase() === platform.toLowerCase(),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const [all, setAll] = useState(false);
  if (!entries.length) return null;
  return (
    <section className="panel">
      <PanelHeader
        title="Recorded snapshots"
        description="Every entry behind the table. Add a new one each time you refresh a competitor rather than overwriting the last."
      />
      <div className="comp-history">
        {(all ? entries : entries.slice(0, 6)).map((b) => {
          const c = competitors.find((x) => x.id === b.competitorId);
          return (
            <div key={b.id}>
              <strong>{c?.name}</strong>
              <span>{niceDate(b.date, { month: "short", day: "numeric", year: "numeric" })}</span>
              <span>
                {METRICS.filter((m) => b[m.key] !== undefined)
                  .map((m) => `${m.label}: ${m.key === "followers" ? compact(b[m.key]) : b[m.key] + m.unit}`)
                  .join(" · ")}
                {b.source ? ` · ${b.source}` : ""}
              </span>
              <span>
                <button className="icon-btn" aria-label="Edit snapshot" onClick={() => open({ type: "benchmark", value: b })}>
                  <Pencil size={14} />
                </button>
                <button
                  className="icon-btn"
                  aria-label="Delete snapshot"
                  disabled={busy}
                  onClick={() => run([{ op: "delete", collection: "benchmarks", id: b.id }], "Snapshot deleted")}
                >
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
          );
        })}
      </div>
      {entries.length > 6 && (
        <button className="text-btn" onClick={() => setAll((v) => !v)}>
          {all ? "Show fewer" : `Show all ${entries.length}`}
        </button>
      )}
    </section>
  );
}

/* 3 · Intel log: what competitors did, and why it matters to us. */
function IntelLog({ state, client, competitors, open, run, busy }) {
  const [category, setCategory] = useState("all");
  const [who, setWho] = useState("all");
  const entries = (state.intel || [])
    .filter((i) => i.clientId === client.id)
    .filter((i) => category === "all" || i.category === category)
    .filter((i) => who === "all" || (who === "market" ? !i.competitorId : i.competitorId === who))
    .sort((a, b) => b.date.localeCompare(a.date));

  const toTask = (i) =>
    run(
      [
        {
          op: "upsert",
          collection: "tasks",
          value: {
            id: uid("task"),
            title: `Respond to competitor move: ${i.observation.slice(0, 80)}`,
            kind: "todo",
            done: false,
            clientId: client.id,
            notes: i.implication || undefined,
            createdAt: new Date().toISOString(),
          },
        },
      ],
      "Task added to your Overview",
    );

  return (
    <>
      <div className="comp-toolbar">
        <label className="comp-platform">
          <span>Type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="all">All types</option>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </label>
        <label className="comp-platform">
          <span>Who</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="all">Everyone</option>
            <option value="market">Market-wide</option>
            {competitors.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <p className="muted">
          Log launches, campaigns, new messaging and price changes as you spot
          them. Always write the “so what”: an observation without an
          implication is trivia.
        </p>
        <button className="btn secondary" onClick={() => open({ type: "intel" })}>
          <Plus size={16} /> Log intel
        </button>
      </div>
      {!entries.length ? (
        <Empty
          icon={Radar}
          title="Nothing logged yet"
          description="Note a competitor's new campaign, a tone shift, a price change or a format that is taking off."
        />
      ) : (
        <div className="intel-list">
          {entries.map((i) => {
            const c = competitors.find((x) => x.id === i.competitorId);
            const site = i.source ? link(i.source) : null;
            return (
              <article className="intel-item" key={i.id}>
                <div className="intel-meta">
                  <strong>{c?.name || "Market-wide"}</strong>
                  <Badge tone="purple">{CATEGORIES[i.category]}</Badge>
                  <span className="muted">{niceDate(i.date, { month: "short", day: "numeric", year: "numeric" })}</span>
                </div>
                <p>{i.observation}</p>
                {i.implication && (
                  <p className="intel-so-what">
                    <b>So what:</b> {i.implication}
                  </p>
                )}
                <div className="intel-actions">
                  {i.source && (site ? (
                    <a href={site} target="_blank" rel="noreferrer noopener">
                      Source <ExternalLink size={11} />
                    </a>
                  ) : (
                    <span className="muted">Source: {i.source}</span>
                  ))}
                  <button className="btn ghost small" disabled={busy} onClick={() => toTask(i)}>
                    <ListPlus size={13} /> Make it a task
                  </button>
                  <button className="btn ghost small" onClick={() => open({ type: "intel", value: i })}>
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    className="icon-btn"
                    aria-label="Delete intel"
                    disabled={busy}
                    onClick={() => run([{ op: "delete", collection: "intel", id: i.id }], "Intel deleted")}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

/* 4 · Gaps & actions: where you trail or lead, openings, and the review rhythm. */
function Gaps({ state, client, competitors, open, run, busy, askClaude }) {
  const platforms = platformsFor(state, client.id);
  const tables = platforms
    .map((p) => ({ platform: p, table: benchmarkTable(state, client.id, p) }))
    .filter((t) => t.table.rows.length);
  const recent = (state.intel || [])
    .filter((i) => i.clientId === client.id && i.implication)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 4);
  const review = (state.tasks || []).find(
    (t) =>
      !t.done &&
      t.clientId === client.id &&
      t.kind === "monthly-analysis" &&
      t.title.startsWith("Competitor review"),
  );
  const staleCount = competitors.filter((c) => {
    const last = (state.benchmarks || [])
      .filter((b) => b.competitorId === c.id)
      .map((b) => b.date)
      .sort()
      .at(-1);
    return !last || last < addDays(today(), -STALE_AFTER_DAYS);
  }).length;
  const strong = competitors.filter((c) => c.strengths);
  const weak = competitors.filter((c) => c.weaknesses);

  const scheduleReview = () =>
    run(
      [
        {
          op: "upsert",
          collection: "tasks",
          value: {
            id: uid("task"),
            title: `Competitor review · ${client.name}`,
            kind: "monthly-analysis",
            repeat: "monthly",
            done: false,
            clientId: client.id,
            dueDate: addDays(today(), 30),
            notes: "Refresh benchmarks, log new moves, update the gaps below.",
            createdAt: new Date().toISOString(),
          },
        },
      ],
      "Monthly competitor review added to your Overview",
    );

  return (
    <div className="comp-gaps">
      <section className="panel">
        <PanelHeader
          title="Where you stand"
          description="You compared with the median of the competitors you track. Within 10% counts as level."
        />
        {tables.length ? (
          tables.map(({ platform, table }) => {
            const insights = gapInsights(table);
            return (
              <div key={platform} className="gap-platform">
                <h4>
                  <Platform platform={platform} size={14} /> {platform}
                </h4>
                {!insights.length ? (
                  <p className="muted">
                    {table.you
                      ? "Record your own matching numbers (followers, engagement) to compare."
                      : "No tracked account on this platform yet, so there is nothing to compare."}
                  </p>
                ) : (
                  insights.map((g) => (
                    <div key={g.key} className={`gap-row ${g.status}`}>
                      <Badge tone={g.status === "ahead" ? "green" : g.status === "behind" ? "amber" : "neutral"}>
                        {titleCase(g.status)}
                      </Badge>
                      <span>
                        <strong>{g.label}</strong>: you {g.key === "followers" ? compact(g.you) : Number(g.you.toFixed(1))}
                        {g.key === "engagementRate" ? "%" : ""} vs median{" "}
                        {g.key === "followers" ? compact(g.median) : Number(g.median.toFixed(1))}
                        {g.key === "engagementRate" ? "%" : ""} ({g.diff > 0 ? "+" : ""}
                        {Math.round(g.diff)}%, {g.sample} competitor{g.sample === 1 ? "" : "s"})
                      </span>
                    </div>
                  ))
                )}
              </div>
            );
          })
        ) : (
          <p className="muted">
            Add benchmark numbers in step 2 to see where you lead and trail.
          </p>
        )}
        <p className="muted comp-caveat">
          Competitor figures are estimates from public profiles and small
          samples. Treat gaps as prompts for a test, not proof of cause.
        </p>
      </section>
      <section className="panel">
        <PanelHeader
          title="Openings"
          description="What rivals are good at, and where they are weak."
        />
        <div className="comp-sw wide">
          <div>
            <b className="green-text">Strengths to match or beat</b>
            {strong.length ? strong.map((c) => <p key={c.id}><strong>{c.name}:</strong> {c.strengths}</p>) : <p className="muted">Note strengths on each competitor.</p>}
          </div>
          <div>
            <b className="amber-text">Weaknesses to exploit</b>
            {weak.length ? weak.map((c) => <p key={c.id}><strong>{c.name}:</strong> {c.weaknesses}</p>) : <p className="muted">Note weaknesses on each competitor.</p>}
          </div>
        </div>
        {recent.length > 0 && (
          <>
            <h4 className="gap-sub">Recent “so whats”</h4>
            {recent.map((i) => (
              <p key={i.id} className="gap-sowhat">
                <strong>{competitors.find((c) => c.id === i.competitorId)?.name || "Market"}</strong>
                {" · "}
                {i.implication}
              </p>
            ))}
          </>
        )}
      </section>
      <section className="panel">
        <PanelHeader title="Act on it" description="Competitor work only helps if it changes what you do." />
        <ul className="comp-actions">
          <li>
            <Repeat size={15} />
            <div>
              <strong>Monthly competitor review</strong>
              <span>
                {review
                  ? `Scheduled${review.dueDate ? ` for ${niceDate(review.dueDate)}` : ""}. It shows in Tasks on your Overview and repeats each month.`
                  : "A monthly refresh keeps benchmarks honest. Adds a repeating task to your Overview."}
              </span>
            </div>
            {!review && (
              <button className="btn secondary small" disabled={busy} onClick={scheduleReview}>
                Schedule
              </button>
            )}
          </li>
          <li>
            <Radar size={15} />
            <div>
              <strong>
                {staleCount
                  ? `${staleCount} competitor${staleCount === 1 ? " needs" : "s need"} fresh numbers`
                  : "All benchmarks are fresh"}
              </strong>
              <span>Numbers older than {STALE_AFTER_DAYS} days or never recorded.</span>
            </div>
          </li>
          <li>
            <Sparkles size={15} />
            <div>
              <strong>Turn gaps into a test</strong>
              <span>Ask Claude for a SWOT, positioning gaps and one controlled next test from your saved data.</span>
            </div>
            <button
              className="btn secondary small"
              onClick={() =>
                askClaude(
                  `Run a competitor analysis for ${client.name} using the competitors, benchmarks and intel in this workspace. Summarize positioning differences, a short SWOT, where we lead and trail on each platform, and the biggest opportunities. Flag small samples, stale numbers and that competitor figures are manual estimates. Then propose one strategy to test (hypothesis, one change, what stays constant, success KPI, review date) and save it only if I confirm.`,
                )
              }
            >
              Ask Claude
            </button>
          </li>
        </ul>
      </section>
    </div>
  );
}

/* Forms */
function FormFooter({ busy, onClose, onDelete, label }) {
  return (
    <div className="dialog-footer">
      {onDelete && (
        <button type="button" className="btn ghost delete-button" disabled={busy} onClick={onDelete}>
          <Trash2 size={15} /> Delete
        </button>
      )}
      <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
        Cancel
      </button>
      <button className="btn primary" disabled={busy}>
        {label}
      </button>
    </div>
  );
}

function CompetitorForm({ state, dialog, busy, onClose, run }) {
  const existing = dialog.value;
  const [f, setF] = useState({
    name: existing?.name || "",
    tier: existing?.tier || "direct",
    threat: existing?.threat || "medium",
    website: existing?.website || "",
    positioning: existing?.positioning || "",
    audience: existing?.audience || "",
    offer: existing?.offer || "",
    strengths: existing?.strengths || "",
    weaknesses: existing?.weaknesses || "",
    notes: existing?.notes || "",
  });
  const [channels, setChannels] = useState(
    existing?.channels?.length ? existing.channels : [{ platform: "", handle: "" }],
  );
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.name.trim()) return setErr("Give the competitor a name.");
    const value = {
      ...(existing || {}),
      id: existing?.id || uid("comp"),
      clientId: existing?.clientId || dialog.clientId,
      ...Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.trim()])),
      channels: channels
        .map((c) => ({ platform: c.platform.trim(), handle: (c.handle || "").trim() }))
        .filter((c) => c.platform),
    };
    if (await run([{ op: "upsert", collection: "competitors", value }], "Competitor saved")) onClose();
  }
  const remove = () => {
    const ops = [
      ...(state.intel || []).filter((i) => i.competitorId === existing.id).map((i) => ({ op: "delete", collection: "intel", id: i.id })),
      ...(state.benchmarks || []).filter((b) => b.competitorId === existing.id).map((b) => ({ op: "delete", collection: "benchmarks", id: b.id })),
      { op: "delete", collection: "competitors", id: existing.id },
    ];
    if (
      window.confirm(
        `Delete ${existing.name} and its ${ops.length - 1} recorded snapshot(s) and intel entries? This cannot be undone.`,
      )
    )
      run(ops, "Competitor deleted").then((ok) => ok && onClose());
  };

  return (
    <Dialog
      wide
      title={existing ? `Edit ${existing.name}` : "Add a competitor"}
      description="Who they are and how they position themselves. Numbers and moves are added separately so they can be tracked over time."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Name" wide>
            <input autoFocus value={f.name} onChange={set("name")} placeholder="Brand or creator" />
          </Field>
          <Field label="Type" hint={TIERS[f.tier].hint}>
            <select value={f.tier} onChange={set("tier")}>
              {Object.entries(TIERS).map(([k, t]) => (
                <option key={k} value={k}>{t.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Threat level" hint="How much they could take from you.">
            <select value={f.threat} onChange={set("threat")}>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <Field label="Website" wide>
            <input value={f.website} onChange={set("website")} placeholder="example.com" />
          </Field>
          <Field label="Positioning" wide hint="Their promise in a sentence: who it is for and why they say they are better.">
            <textarea value={f.positioning} onChange={set("positioning")} />
          </Field>
          <Field label="Target audience">
            <input value={f.audience} onChange={set("audience")} />
          </Field>
          <Field label="Offer & pricing">
            <input value={f.offer} onChange={set("offer")} />
          </Field>
          <Field label="Strengths" wide>
            <textarea value={f.strengths} onChange={set("strengths")} />
          </Field>
          <Field label="Weaknesses" wide>
            <textarea value={f.weaknesses} onChange={set("weaknesses")} />
          </Field>
        </div>
        <fieldset className="comp-channel-editor">
          <legend>Channels</legend>
          {channels.map((c, i) => (
            <div key={i}>
              <input
                aria-label="Platform"
                list="comp-platforms"
                placeholder="Platform"
                value={c.platform}
                onChange={(e) => setChannels(channels.map((x, j) => (j === i ? { ...x, platform: e.target.value } : x)))}
              />
              <input
                aria-label="Handle"
                placeholder="@handle"
                value={c.handle || ""}
                onChange={(e) => setChannels(channels.map((x, j) => (j === i ? { ...x, handle: e.target.value } : x)))}
              />
              <button type="button" className="icon-btn" aria-label="Remove channel" onClick={() => setChannels(channels.filter((_, j) => j !== i))}>
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <datalist id="comp-platforms">
            {PLATFORM_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
          </datalist>
          <button type="button" className="btn ghost small" onClick={() => setChannels([...channels, { platform: "", handle: "" }])}>
            <Plus size={13} /> Add channel
          </button>
        </fieldset>
        {err && <p className="error">{err}</p>}
        <FormFooter busy={busy} onClose={onClose} onDelete={existing ? remove : null} label={existing ? "Save changes" : "Add competitor"} />
      </form>
    </Dialog>
  );
}

function BenchmarkForm({ state, dialog, busy, onClose, run }) {
  const existing = dialog.value;
  const competitors = (state.competitors || []).filter((c) => c.clientId === dialog.clientId);
  const [f, setF] = useState({
    competitorId: existing?.competitorId || dialog.competitorId || competitors[0]?.id || "",
    platform: existing?.platform || dialog.platform || "",
    date: existing?.date || today(),
    followers: existing?.followers ?? "",
    postsPerWeek: existing?.postsPerWeek ?? "",
    engagementRate: existing?.engagementRate ?? "",
    source: existing?.source || "",
  });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const competitor = competitors.find((c) => c.id === f.competitorId);

  async function submit(e) {
    e.preventDefault();
    if (!competitor) return setErr("Choose a competitor.");
    if (!f.platform.trim()) return setErr("Choose the platform these numbers are from.");
    const values = {};
    for (const k of ["followers", "postsPerWeek", "engagementRate"]) {
      const n = num(f[k]);
      if (n === undefined) continue;
      if (!Number.isFinite(n) || n < 0) return setErr(`${METRICS.find((m) => m.key === k).label} must be a positive number.`);
      values[k] = n;
    }
    if (values.engagementRate > 100) return setErr("Engagement rate is a percentage from 0 to 100.");
    if (!Object.keys(values).length) return setErr("Enter at least one number.");
    const value = {
      ...(existing || {}),
      id: existing?.id || uid("bench"),
      competitorId: f.competitorId,
      platform: f.platform.trim(),
      date: f.date,
      ...values,
      ...(f.source.trim() ? { source: f.source.trim() } : {}),
    };
    for (const k of ["followers", "postsPerWeek", "engagementRate"]) if (!(k in values)) delete value[k];
    if (!f.source.trim()) delete value.source;
    if (await run([{ op: "upsert", collection: "benchmarks", value }], "Snapshot saved")) onClose();
  }
  const known = existing ? null : snapshots(state, f.competitorId, f.platform).latest;

  return (
    <Dialog
      title={existing ? "Edit snapshot" : "Add competitor numbers"}
      description="Copy what is publicly visible on their profile today. Leave blank what you cannot see."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Competitor">
            <select value={f.competitorId} onChange={set("competitorId")}>
              {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Platform">
            <input autoFocus list="comp-platforms2" value={f.platform} onChange={set("platform")} placeholder="e.g. Instagram" />
            <datalist id="comp-platforms2">
              {[...new Set([...(competitor?.channels || []).map((c) => c.platform), ...PLATFORM_SUGGESTIONS])].map((p) => <option key={p} value={p} />)}
            </datalist>
          </Field>
          <Field label="As of" hint="Use the day you looked.">
            <input type="date" max={today()} value={f.date} onChange={set("date")} />
          </Field>
          <Field label="Audience (followers / subscribers)">
            <input inputMode="decimal" value={f.followers} onChange={set("followers")} />
          </Field>
          <Field label="Posts per week" hint="Count their last 4 weeks, divide by 4.">
            <input inputMode="decimal" value={f.postsPerWeek} onChange={set("postsPerWeek")} />
          </Field>
          <Field label="Engagement rate %" hint="(likes + comments) ÷ followers across recent posts.">
            <input inputMode="decimal" value={f.engagementRate} onChange={set("engagementRate")} />
          </Field>
          <Field label="Where this came from" wide>
            <input value={f.source} onChange={set("source")} placeholder="Profile page, last 12 posts" />
          </Field>
        </div>
        {known && (
          <p className="muted">
            Last recorded {niceDate(known.date)}
            {known.followers !== undefined ? `: ${compact(known.followers)} audience` : ""}.
          </p>
        )}
        {err && <p className="error">{err}</p>}
        <FormFooter busy={busy} onClose={onClose} label={existing ? "Save changes" : "Save numbers"} />
      </form>
    </Dialog>
  );
}

function IntelForm({ state, dialog, busy, onClose, run }) {
  const existing = dialog.value;
  const competitors = (state.competitors || []).filter((c) => c.clientId === dialog.clientId);
  const [f, setF] = useState({
    competitorId: existing?.competitorId || "",
    date: existing?.date || today(),
    category: existing?.category || "content",
    observation: existing?.observation || "",
    implication: existing?.implication || "",
    source: existing?.source || "",
  });
  const [err, setErr] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    if (!f.observation.trim()) return setErr("Describe what you saw.");
    const value = {
      ...(existing || {}),
      id: existing?.id || uid("intel"),
      clientId: existing?.clientId || dialog.clientId,
      date: f.date,
      category: f.category,
      observation: f.observation.trim(),
      ...(f.competitorId ? { competitorId: f.competitorId } : {}),
      ...(f.implication.trim() ? { implication: f.implication.trim() } : {}),
      ...(f.source.trim() ? { source: f.source.trim() } : {}),
    };
    if (!f.competitorId) delete value.competitorId;
    if (!f.implication.trim()) delete value.implication;
    if (!f.source.trim()) delete value.source;
    if (await run([{ op: "upsert", collection: "intel", value }], "Intel saved")) onClose();
  }

  return (
    <Dialog
      title={existing ? "Edit intel" : "Log competitor intel"}
      description="One move or observation, plus why it matters to you."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          <Field label="Who">
            <select value={f.competitorId} onChange={set("competitorId")}>
              <option value="">Market-wide</option>
              {competitors.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select value={f.category} onChange={set("category")}>
              {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </Field>
          <Field label="Date seen">
            <input type="date" max={today()} value={f.date} onChange={set("date")} />
          </Field>
          <Field label="Link or source">
            <input value={f.source} onChange={set("source")} placeholder="URL or where you saw it" />
          </Field>
          <Field label="What happened" wide>
            <textarea autoFocus value={f.observation} onChange={set("observation")} placeholder="e.g. Launched a weekly Reels series on founder stories" />
          </Field>
          <Field label="So what?" wide hint="Why it matters to us and what we might do about it.">
            <textarea value={f.implication} onChange={set("implication")} />
          </Field>
        </div>
        {err && <p className="error">{err}</p>}
        <FormFooter
          busy={busy}
          onClose={onClose}
          onDelete={existing ? () => run([{ op: "delete", collection: "intel", id: existing.id }], "Intel deleted").then((ok) => ok && onClose()) : null}
          label={existing ? "Save changes" : "Save intel"}
        />
      </form>
    </Dialog>
  );
}
