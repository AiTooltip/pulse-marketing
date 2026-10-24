import { useMemo, useState } from "react";
import { Check, Lightbulb, Pencil, Plus, Trash2 } from "lucide-react";
import { addDays, today } from "../shared/domain.mjs";
import {
  PROVEN_AFTER,
  TACTIC_STATUSES,
  tacticLifecycle,
  evaluateTheory,
  measureKey,
  headToHead,
  tacticTheories,
  uploadDate,
  videoMeasures,
  videoRows,
} from "../shared/analysis.mjs";
import { Badge, Dialog, Empty, Field, fmt, niceDate, uid } from "./components.jsx";
import {
  CATEGORIES,
  SUGGESTED_STRATEGIES,
  SUGGESTED_TACTICS,
  categoryLabel,
} from "./suggestions.js";

const STATUS = {
  proven: ["green", "Strong pattern"],
  emerging: ["green", "Emerging"],
  hypothesis: ["neutral", "Early signal"],
  mixed: ["amber", "Mixed results"],
  unlikely: ["red", "Unlikely"],
  "not-holding": ["red", "Not holding up"],
  "no-baseline": ["neutral", "Needs videos without it"],
};
export const measureLabel = (m) =>
  `${m.kpi.name} · ${m.periodDays ? `over ${m.periodDays} days` : "total so far"}`;
const pct = (p) => (p === null || p === undefined ? "—" : `${p > 0 ? "+" : ""}${p.toFixed(0)}%`);

/* ------------------------------------------------------------------ */
/* Theories: which tactics seem to work, and how often they were tested */
/* ------------------------------------------------------------------ */
export function TheoriesPanel({ state, account, measure, from, to, mutate, onStart, isTracked }) {
  const [open, setOpen] = useState("");
  const [busy, setBusy] = useState("");
  const m = videoMeasures(state, account.id).find((x) => x.key === measure);
  const theories = m
    ? tacticTheories(state, {
        accountId: account.id,
        measure,
        direction: m.kpi.direction,
        from,
        to,
        includeUnused: false,
      })
    : [];
  const practiceId = (t) => `practice-theory-${t.id}-${m.kpiId}-${m.periodDays}`;
  const saveTheory = async (th) => {
    setBusy(th.tactic.id);
    try {
      const label = measureLabel(m);
      const confidence =
        th.status === "proven" ? "validated" : th.status === "emerging" ? "emerging" : "hypothesis";
      await mutate("practices", {
        id: practiceId(th.tactic),
        clientId: account.clientId,
        tacticId: th.tactic.id,
        title: `${th.tactic.name} → ${label}`,
        evidence: `${th.beat} of ${th.tests} video${th.tests === 1 ? "" : "s"} with this tactic beat the typical result of videos without it (median ${fmt(th.withMedian, m.kpi.unit)} vs ${th.baseline === null ? "n/a" : fmt(th.baseline, m.kpi.unit)}${th.lift === null ? "" : `, ${pct(th.lift)}`}).`,
        explanation:
          "Videos using this tactic were compared with videos that did not. This shows what moved together, not proof the tactic caused it; other tactics on the same videos can overlap.",
        nextTest: th.moreNeeded
          ? `Test it on ${th.moreNeeded} more video${th.moreNeeded === 1 ? "" : "s"} to reach ${PROVEN_AFTER} tests. Try it with only 1 or 2 other tactics.`
          : "Retest now and then, and try it with fewer other tactics to isolate its effect.",
        confidence,
        source: "manual",
      });
    } finally {
      setBusy("");
    }
  };
  if (!m)
    return (
      <p className="muted">
        Record per-video numbers (for example views over 7 days) for videos with tactics to see theories here.
      </p>
    );
  if (!theories.length)
    return (
      <p className="muted">
        No tactics are tagged on videos with {measureLabel(m)} yet. Tag videos with tactics (Tag videos tab, or when adding a
        video) and record their numbers.
      </p>
    );
  return (
    <>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tactic</th>
              <th>Tests</th>
              <th>Beat the typical video</th>
              <th>With vs without (median)</th>
              <th>Lift</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {theories.map((th) => {
              const [tone, label] = STATUS[th.status];
              const saved = state.practices.find((p) => p.id === practiceId(th.tactic));
              return [
                <tr key={th.tactic.id} onClick={() => setOpen(open === th.tactic.id ? "" : th.tactic.id)} style={{ cursor: "pointer" }}>
                  <td>
                    <strong>{th.tactic.name}</strong>
                    <br />
                    <small className="muted">{categoryLabel(th.tactic.category)}</small>
                  </td>
                  <td>
                    <span className="pips" title={`${th.tests} of ${PROVEN_AFTER} tests`}>
                      {Array.from({ length: Math.max(PROVEN_AFTER, Math.min(th.tests, 10)) }, (_, i) => {
                        const r = th.results[i];
                        return <i key={i} className={r ? (r.beat ? "pip win" : "pip loss") : "pip"} />;
                      })}
                    </span>
                    <small className="muted"> {th.tests}/{PROVEN_AFTER}</small>
                  </td>
                  <td>{th.baseline === null ? "—" : `${th.beat} of ${th.tests}`}</td>
                  <td>
                    {fmt(th.withMedian, m.kpi.unit)}
                    <small className="muted"> vs {th.baseline === null ? "—" : fmt(th.baseline, m.kpi.unit)}</small>
                  </td>
                  <td className={th.lift === null ? "" : (th.lift >= 0) === (m.kpi.direction !== "decrease") ? "good-text" : "bad-text"}>{pct(th.lift)}</td>
                  <td>
                    <Badge tone={tone}>{label}</Badge>
                    {th.moreNeeded > 0 && th.status !== "no-baseline" && <small className="muted"> · {th.moreNeeded} more test{th.moreNeeded === 1 ? "" : "s"}</small>}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    {onStart ? (
                      isTracked?.(th.tactic) ? (
                        <small className="muted">Already testing</small>
                      ) : (
                        <button className="btn secondary small" onClick={() => onStart(th.tactic)}>
                          Start testing
                        </button>
                      )
                    ) : (
                      <button className="btn secondary small" disabled={busy === th.tactic.id} onClick={() => saveTheory(th)}>
                        {saved ? "Update in Best practices" : "Save to Best practices"}
                      </button>
                    )}
                  </td>
                </tr>,
                open === th.tactic.id && (
                  <tr key={`${th.tactic.id}-d`}>
                    <td colSpan={7}>
                      <div className="theory-detail">
                        {th.results.map((r) => (
                          <span key={r.title} className={r.beat ? "good-text" : "bad-text"}>
                            {r.beat ? "✓" : "✗"} {r.title}: {fmt(r.value, m.kpi.unit)}
                          </span>
                        ))}
                        <small className="muted">
                          Compared against {th.withoutCount} video{th.withoutCount === 1 ? "" : "s"} without this tactic.
                          {th.otherTacticsAvg >= 1.5
                            ? ` These videos also used about ${th.otherTacticsAvg.toFixed(1)} other tactics each, so effects overlap. Fewer tactics per video gives a cleaner answer.`
                            : ""}
                        </small>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>
      <p className="muted small">
        Each video that used a tactic is compared with the typical (median) video that didn&apos;t. A <strong>strong pattern</strong> means
        {" "}{PROVEN_AFTER}+ videos with at least 80% beating that baseline. It is an observation from past videos, not yet a proven tactic.
        To prove one, choose “Start testing”: new videos using it become deliberate tests. Click a row to see the videos.
      </p>
    </>
  );
}

export function HeadToHead({ state, account, measure, from, to }) {
  const m = videoMeasures(state, account.id).find((x) => x.key === measure);
  const used = state.tactics.filter((t) => state.posts.some((p) => (p.tacticIds || []).includes(t.id)));
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const A = a || used[0]?.id;
  const B = b || used[1]?.id;
  if (!m || used.length < 2)
    return <p className="muted">Tag videos with at least two tactics and record their numbers to compare tactics head to head.</p>;
  const h = headToHead(state, { accountId: account.id, measure, a: A, b: B, from, to });
  const name = (id) => state.tactics.find((t) => t.id === id)?.name || "";
  const rows = [
    [`Only “${name(A)}”`, h.onlyA],
    [`Only “${name(B)}”`, h.onlyB],
    ["Both", h.both],
    ["Neither", h.neither],
  ];
  return (
    <>
      <div className="filter-bar">
        <label className="field">
          <span>Tactic A</span>
          <select value={A} onChange={(e) => setA(e.target.value)}>
            {used.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Tactic B</span>
          <select value={B} onChange={(e) => setB(e.target.value)}>
            {used.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Videos with…</th>
            <th>Videos</th>
            <th>Median {measureLabel(m)}</th>
            <th>Average</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, g]) => (
            <tr key={label}>
              <td>{label}</td>
              <td>
                {g.n} {g.n > 0 && g.n < 3 && <small className="muted">· small sample</small>}
              </td>
              <td>{g.median === null ? "—" : <strong>{fmt(g.median, m.kpi.unit)}</strong>}</td>
              <td>{g.avg === null ? "—" : fmt(g.avg, m.kpi.unit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted small">The “only A” and “only B” rows isolate each tactic. If most videos have both, you can&apos;t tell them apart yet.</p>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function TacticsPage({ state, data, mutate, mutateMany, openForm }) {
  const accounts = data.accounts.filter((a) => state.posts.some((p) => p.accountId === a.id) || state.metrics.some((m) => m.accountId === a.id));
  const [tab, setTab] = useState("theories");
  const [statusFilter, setStatusFilter] = useState("");
  const [accountId, setAccountId] = useState(
    [...accounts].sort(
      (x, y) =>
        state.posts.filter((p) => p.accountId === y.id).length +
        (/youtube/i.test(y.platform) ? 3 : 0) -
        (state.posts.filter((p) => p.accountId === x.id).length + (/youtube/i.test(x.platform) ? 3 : 0)),
    )[0]?.id || "",
  );
  const account = accounts.find((a) => a.id === accountId) || accounts[0];
  const measures = useMemo(() => (account ? videoMeasures(state, account.id) : []), [state, account?.id]);
  const [measureKey, setMeasureKey] = useState("");
  const measure =
    measures.find((m) => m.key === measureKey) ||
    measures.find((m) => /view/i.test(m.kpi.name) && m.periodDays === 7) ||
    measures.find((m) => /view/i.test(m.kpi.name)) ||
    measures[0];
  const [rangeId, setRangeId] = useState("all");
  const ranges = { all: null, "6m": 183, "1y": 365, "12w": 84 };
  const to = today();
  const from = ranges[rangeId] ? addDays(to, -ranges[rangeId]) : "";

  const tabs = [
    ["theories", "Theories & proof"],
    ["tag", "Tag videos"],
    ["library", `My tactics (${state.tactics.length})`],
    ["ideas", "Suggestions"],
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Tactics lab</h1>
          <p className="muted">
            Tag videos with the specific choices you made. Pulse compares videos
            with and without each tactic, and turns patterns into theories you
            can test until they are proven.
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist" aria-label="Tactics lab sections">
        {tabs.map(([id, label]) => (
          <button key={id} role="tab" aria-selected={tab === id} className={tab === id ? "selected" : ""} onClick={() => setTab(id)}>
            {label}
          </button>
        ))}
      </div>
      {tab !== "ideas" && state.tactics.length > 0 && (
        <p className="section-caption">Your tactics by stage, across all accounts. Choose a stage to filter.</p>
      )}
      {tab !== "ideas" && state.tactics.length > 0 && (
        <div className="lab-stats tactic-stats" aria-label="Your tactics by stage, across all accounts. Choose one to filter.">
          {TACTIC_STATUSES.map(([value, label, help]) => (
            <button
              key={value}
              className={`lab-stat ${statusFilter === value ? "selected" : ""}`}
              onClick={() => setStatusFilter(statusFilter === value ? "" : value)}
            >
              <strong>{state.tactics.filter((t) => tacticLifecycle(state, t).status === value).length}</strong>
              <span>{label}</span>
              <small>{help}</small>
            </button>
          ))}
        </div>
      )}
      {statusFilter && tab !== "ideas" && (
        <p className="muted small">
          Showing {TACTIC_STATUSES.find(([v]) => v === statusFilter)?.[1]} tactics in My tactics and Tag videos.{" "}
          <button className="text-btn" onClick={() => setStatusFilter("")}>Show all</button>
        </p>
      )}
      {(tab === "theories" || tab === "tag") && account && (
        <section className="panel analysis-controls">
          <div className="filter-bar">
            <label className="field">
              <span>Account</span>
              <select value={account.id} onChange={(e) => { setAccountId(e.target.value); setMeasureKey(""); }}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.handle} · {a.platform}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Video measure</span>
              <select value={measure?.key || ""} onChange={(e) => setMeasureKey(e.target.value)}>
                {!measures.length && <option value="">No video numbers yet</option>}
                {measures.map((m) => (
                  <option key={m.key} value={m.key}>
                    {measureLabel(m)}
                  </option>
                ))}
              </select>
            </label>

          </div>
        </section>
      )}
      {tab === "theories" && (
        <>
          {account ? (
            <Workflow {...{ state, account, measures, measure, mutate, mutateMany, openForm }} />
          ) : (
            <p className="muted">Add a social account and videos first.</p>
          )}
          {account && (
            <section className="panel">
              <h3>Compare two tactics head to head</h3>
              <HeadToHead state={state} account={account} measure={measure?.key} from={from} to={to} />
            </section>
          )}
        </>
      )}
      {tab === "tag" && <TagVideos {...{ state, account, measure, mutate, mutateMany, statusFilter }} />}
      {tab === "library" && <Library {...{ state, mutate, mutateMany, statusFilter }} />}
      {tab === "ideas" && <Ideas {...{ state, mutate, mutateMany }} />}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Theory workflow: observe → test → prove                             */
/* ------------------------------------------------------------------ */
const THEORY_STATUS = {
  testing: ["purple", "Testing"],
  proven: ["green", "Proven"],
  disproven: ["red", "Not holding up"],
  paused: ["neutral", "Paused"],
};

function NewTheory({ state, account, measures, onSave, onClose, initial }) {
  const [tacticId, setTacticId] = useState(initial?.tacticId || state.tactics[0]?.id || "");
  const [measureKey, setMeasureKey] = useState(initial?.measureKey || measures[0]?.key || "");
  const m = measures.find((x) => x.key === measureKey);
  const tactic = state.tactics.find((t) => t.id === tacticId);
  const [statement, setStatement] = useState("");
  const [startedAt, setStartedAt] = useState(today());
  const [error, setError] = useState("");
  const autoText = tactic && m ? `Videos using “${tactic.name}” will beat the typical video on ${measureLabel(m)}.` : "";
  const save = async (e) => {
    e.preventDefault();
    if (!tactic || !m) return setError("Choose a tactic and a measure.");
    try {
      await onSave({
        id: uid("theory"),
        tacticId,
        accountId: account.id,
        kpiId: m.kpiId,
        ...(m.periodDays ? { periodDays: m.periodDays } : {}),
        statement: (statement || autoText).trim(),
        startedAt,
        status: "testing",
      });
      onClose();
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <Dialog title="Start testing a theory" description="You think a tactic helps. The videos you upload from the start date that use it become the tests." onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Tactic">
            <select value={tacticId} onChange={(e) => setTacticId(e.target.value)}>
              {state.tactics.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
          <Field label="Measure it should improve">
            <select value={measureKey} onChange={(e) => setMeasureKey(e.target.value)}>
              {measures.map((x) => (
                <option key={x.key} value={x.key}>{measureLabel(x)}</option>
              ))}
            </select>
          </Field>
          <Field label="Your theory" wide>
            <textarea rows={2} value={statement} placeholder={autoText} onChange={(e) => setStatement(e.target.value)} />
          </Field>
          <Field label="Counting tests from" hint="Videos uploaded on or after this date count as tests. Earlier ones are shown as evidence.">
            <input type="date" value={startedAt} max={today()} onChange={(e) => setStartedAt(e.target.value)} />
          </Field>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="dialog-footer">
          <button type="button" className="btn secondary" onClick={onClose}>Cancel</button>
          <button className="btn primary">Start testing</button>
        </div>
      </form>
    </Dialog>
  );
}

function Workflow({ state, account, measures, measure, mutate, mutateMany, openForm }) {
  const [creating, setCreating] = useState(null);
  const [open, setOpen] = useState("");
  const [showDone, setShowDone] = useState(false);
  const theories = state.theories.filter((t) => t.accountId === account.id);
  const testing = theories.filter((t) => t.status === "testing" || t.status === "paused");
  const done = theories.filter((t) => t.status === "proven" || t.status === "disproven");
  const tracked = new Set(theories.filter((t) => t.status !== "disproven").map((t) => `${t.tacticId}|${measureKey(t.kpiId, t.periodDays)}`));
  const label = (th) => {
    const m = measures.find((x) => x.key === measureKey(th.kpiId, th.periodDays));
    return m ? measureLabel(m) : "measure";
  };
  const tacticName = (id) => state.tactics.find((t) => t.id === id)?.name || "Tactic";
  const unitOf = (th) => account.kpis.find((k) => k.id === th.kpiId)?.unit;
  const setStatus = async (th, status) => {
    const ops = [{ op: "upsert", collection: "theories", value: { ...th, status, ...(status === "proven" || status === "disproven" ? { decidedAt: today() } : { decidedAt: undefined }) } }];
    if (status === "proven") {
      const e = evaluateTheory(state, th);
      ops.push({
        op: "upsert",
        collection: "practices",
        value: {
          id: `practice-theory-${th.id}`,
          clientId: account.clientId,
          tacticId: th.tacticId,
          title: `${tacticName(th.tacticId)} → ${label(th)}`,
          evidence: `Proven after ${e.tests.length} tests: ${e.beat} beat the typical video without it (median ${e.baseline === null ? "n/a" : fmt(e.baseline, unitOf(th))}).`,
          explanation: th.statement + " This describes what moved together across your tests, not proof of cause.",
          nextTest: "Keep using it, and retest now and then with fewer other tactics on the video.",
          confidence: "validated",
          source: "manual",
        },
      });
    }
    const tactic = state.tactics.find((t) => t.id === th.tacticId);
    if (status === "proven" && tactic?.status && tactic.status !== "adopted") {
      const { status: _old, ...rest } = tactic;
      ops.push({ op: "upsert", collection: "tactics", value: rest });
    }
    await mutateMany(ops.map((o) => (o.value.decidedAt === undefined ? { ...o, value: Object.fromEntries(Object.entries(o.value).filter(([k]) => k !== "decidedAt")) } : o)));
  };
  const card = (th) => {
    const e = evaluateTheory(state, th);
    const [tone, text] = THEORY_STATUS[th.status];
    const shown = Math.max(PROVEN_AFTER, e.tests.length);
    return (
      <div className="panel theory-card" key={th.id}>
        <div className="section-label">
          <h4>
            {tacticName(th.tacticId)} <small className="muted">→ {label(th)}</small>
          </h4>
          <Badge tone={tone}>{text}</Badge>
        </div>
        <p>{th.statement}</p>
        <div>
          <span className="pips">
            {Array.from({ length: Math.min(shown, 12) }, (_, i) => {
              const r = e.tests[i];
              return <i key={i} className={r ? (r.beat ? "pip win" : "pip loss") : "pip"} />;
            })}
          </span>{" "}
          <strong>{e.tests.length}</strong> of {PROVEN_AFTER} tests
          {e.baseline !== null && e.tests.length > 0 && <span> · {e.beat} beat the typical video</span>}
          {e.moreNeeded > 0 && <small className="muted"> · {e.moreNeeded} more to go</small>}
        </div>
        <p className="muted small">
          {e.baseline === null
            ? "Needs at least 2 measured videos without this tactic to compare against. "
            : `Typical video without it: ${fmt(e.baseline, unitOf(th))}. `}
          {e.evidence.length > 0 && `Before testing began, ${e.evidenceBeat} of ${e.evidence.length} video${e.evidence.length === 1 ? "" : "s"} with it beat that. `}
          {e.planned > 0 && `${e.planned} planned video${e.planned === 1 ? "" : "s"} will test it. `}
          {e.awaiting > 0 && `${e.awaiting} uploaded video${e.awaiting === 1 ? " is" : "s are"} waiting for numbers.`}
        </p>
        {e.ready === "ready-proven" && th.status === "testing" && <p className="good-text"><strong>Ready: {e.beat} of {e.tests.length} tests beat the baseline.</strong> You can mark this proven.</p>}
        {e.ready === "ready-disproven" && th.status === "testing" && <p className="bad-text"><strong>{e.beat} of {e.tests.length} tests beat the baseline.</strong> It does not seem to hold up.</p>}
        {e.ready === "inconclusive" && th.status === "testing" && <p className="muted"><strong>Mixed so far ({e.beat} of {e.tests.length}).</strong> Keep testing before deciding.</p>}
        {open === th.id && (
          <div className="theory-detail">
            {e.tests.map((r) => (
              <span key={r.title + r.upload} className={r.beat ? "good-text" : "bad-text"}>
                {r.beat ? "✓" : "✗"} {r.title} ({niceDate(r.upload)}): {fmt(r.value, unitOf(th))}
              </span>
            ))}
            {!e.tests.length && <span className="muted">No tests yet. Upload a video using this tactic and record its numbers.</span>}
          </div>
        )}
        <div className="dialog-footer" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
          {th.status === "testing" && (
            <>
              <button className="btn secondary small" onClick={() => openForm("video", null, { tacticIds: [th.tacticId], accountId: th.accountId })}>
                <Plus size={14} /> Add a test video
              </button>
              <button className="btn ghost small" onClick={() => openForm("post", null, { tacticIds: [th.tacticId], accountId: th.accountId })}>
                Plan a test video
              </button>
              <button className={`btn small ${e.ready === "ready-proven" ? "primary" : "ghost"}`} disabled={e.ready !== "ready-proven"} title={e.ready === "ready-proven" ? "" : `Needs ${PROVEN_AFTER} tests with at least 80% beating the baseline`} onClick={() => setStatus(th, "proven")}>
                Mark as proven
              </button>
              {e.ready === "ready-disproven" && (
                <button className="btn ghost small" onClick={() => setStatus(th, "disproven")}>Not holding up</button>
              )}
              <button className="btn ghost small" onClick={() => setStatus(th, "paused")}>Pause</button>
            </>
          )}
          {th.status === "paused" && <button className="btn secondary small" onClick={() => setStatus(th, "testing")}>Resume testing</button>}
          {(th.status === "proven" || th.status === "disproven") && <button className="btn secondary small" onClick={() => setStatus(th, "testing")}>Retest</button>}
          <button className="btn ghost small" onClick={() => setOpen(open === th.id ? "" : th.id)}>{open === th.id ? "Hide tests" : "Show tests"}</button>
          <button className="btn ghost danger small" onClick={() => mutateMany([{ op: "delete", collection: "theories", id: th.id }])}>
            <Trash2 size={14} /> Delete
          </button>
        </div>
      </div>
    );
  };
  return (
    <>
      <section className="panel workflow-intro">
        <h3>How theories work</h3>
        <ol className="workflow-steps">
          <li><strong>Observe.</strong> Pulse spots patterns in your past videos.</li>
          <li><strong>Test.</strong> Start testing a theory. Each new video using the tactic is one test.</li>
          <li><strong>Prove.</strong> After {PROVEN_AFTER} tests with at least 80% beating the typical video, mark it proven. It is saved to Best practices.</li>
        </ol>
        <div className="dialog-footer" style={{ justifyContent: "flex-start" }}>
          <button className="btn primary small" onClick={() => setCreating({})} disabled={!state.tactics.length || !measures.length}>
            <Plus size={14} /> Start testing a theory
          </button>
          {!state.tactics.length && <small className="muted">Add tactics first (My tactics or Suggestions).</small>}
        </div>
      </section>
      {creating && <NewTheory state={state} account={account} measures={measures} initial={creating} onSave={(t) => mutate("theories", t)} onClose={() => setCreating(null)} />}

      <h3 className="lab-heading">Theories being tested on {account.handle} <span>{testing.length}</span></h3>
      {testing.length ? testing.map(card) : <p className="muted">No theories are being tested on this account yet. Start from an observed pattern below, or start one yourself.</p>}

      <h3 className="lab-heading">Observed patterns <small className="muted">· from your past videos, {measure ? measureLabel(measure) : ""}</small></h3>
      <section className="panel">
        <TheoriesPanel
          state={state}
          account={account}
          measure={measure?.key}
          mutate={mutate}
          isTracked={(t) => tracked.has(`${t.id}|${measure?.key}`)}
          onStart={(tactic) => setCreating({ tacticId: tactic.id, measureKey: measure?.key })}
        />
      </section>

      {done.length > 0 && (
        <>
          <h3 className="lab-heading">Proven and decided <span>{done.length}</span></h3>
          {done.map(card)}
        </>
      )}
    </>
  );
}

/* ---------------- Tag videos in bulk ---------------- */
function TagVideos({ state, account, measure, mutate, mutateMany, statusFilter }) {
  const tactics = state.tactics.filter((t) => !statusFilter || tacticLifecycle(state, t).status === statusFilter);
  const [picked, setPicked] = useState([]);
  const [tacticId, setTacticId] = useState("");
  const [busy, setBusy] = useState(false);
  const posts = state.posts
    .filter((p) => account && p.accountId === account.id && p.status !== "cancelled")
    .sort((a, b) => uploadDate(b).localeCompare(uploadDate(a)));
  const valueOf = (p) => {
    if (!measure) return undefined;
    const rows = videoRows(state, { accountId: account.id }).find((r) => r.post.id === p.id);
    return rows?.values[measure.key]?.value;
  };
  const tid = tactics.some((t) => t.id === tacticId) ? tacticId : tactics[0]?.id;
  const apply = async (add) => {
    if (!tid || !picked.length) return;
    setBusy(true);
    try {
      await mutateMany(
        posts
          .filter((p) => picked.includes(p.id))
          .map((p) => {
            const set = new Set(p.tacticIds || []);
            if (add) set.add(tid);
            else set.delete(tid);
            return { op: "upsert", collection: "posts", value: { ...p, tacticIds: [...set] } };
          }),
      );
      setPicked([]);
    } finally {
      setBusy(false);
    }
  };
  const toggleOne = (p, id) => {
    const set = new Set(p.tacticIds || []);
    set.has(id) ? set.delete(id) : set.add(id);
    return mutate("posts", { ...p, tacticIds: [...set] });
  };
  if (!state.tactics.length)
    return <Empty icon={Lightbulb} title="No tactics yet" description="Add your own on the My tactics tab, or pick from the Suggestions tab, then tag your videos here." />;
  if (!posts.length)
    return <Empty icon={Lightbulb} title="No videos yet" description="Add uploaded videos from the Content calendar, or add a video while adding its metrics." />;
  return (
    <section className="panel">
      <h3>Tag videos with tactics</h3>
      <p className="muted small">Click a tactic on a video to add or remove it. To tag many videos at once, tick them, pick a tactic and use the buttons.</p>
      <div className="bulk-bar">
        <strong>{picked.length} selected</strong>
        <select value={tid || ""} onChange={(e) => setTacticId(e.target.value)} aria-label="Tactic to apply">
          {tactics.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button className="btn primary small" disabled={!picked.length || busy} onClick={() => apply(true)}>
          Add to selected
        </button>
        <button className="btn ghost small" disabled={!picked.length || busy} onClick={() => apply(false)}>
          Remove from selected
        </button>
        <button className="btn ghost small" onClick={() => setPicked(picked.length === posts.length ? [] : posts.map((p) => p.id))}>
          {picked.length === posts.length ? "Clear" : "Select all"}
        </button>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th />
              <th>Video</th>
              <th>Uploaded</th>
              <th>{measure ? measureLabel(measure) : "Result"}</th>
              <th>Tactics</th>
            </tr>
          </thead>
          <tbody>
            {posts.map((p) => {
              const v = valueOf(p);
              return (
                <tr key={p.id}>
                  <td>
                    <input type="checkbox" aria-label={`Select ${p.title}`} checked={picked.includes(p.id)} onChange={(e) => setPicked((l) => (e.target.checked ? [...l, p.id] : l.filter((x) => x !== p.id)))} />
                  </td>
                  <td>{p.title}</td>
                  <td>{niceDate(uploadDate(p), { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td>{v === undefined ? <span className="muted">—</span> : fmt(v, measure.kpi.unit)}</td>
                  <td>
                    <div className="chip-row">
                      {tactics.map((t) => {
                        const on = (p.tacticIds || []).includes(t.id);
                        return (
                          <button key={t.id} type="button" className={`chip ${on ? "on" : ""}`} aria-pressed={on} onClick={() => toggleOne(p, t.id)}>
                            {on && <Check size={13} />} {t.name}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Library: add, edit, delete ---------------- */
function TacticForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState({ name: "", category: "other", description: "", status: "", ...initial });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return setError("Give the tactic a name.");
    setBusy(true);
    try {
      const { status, ...rest } = form;
      await onSave({ ...rest, ...(status ? { status } : {}), id: form.id || uid("tactic"), name: form.name.trim() });
      onClose();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Dialog title={initial?.id ? "Edit tactic" : "Add a tactic"} description="A specific choice you make in a video, such as a CTA in the first 2 minutes." onClose={onClose}>
      <form onSubmit={save}>
        <div className="form-grid">
          <Field label="Name" wide>
            <input autoFocus value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Call to action within the first 2 minutes" />
          </Field>
          <Field label="Type">
            <select value={form.category || "other"} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {CATEGORIES.map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Status" hint="Leave on Auto to follow the evidence. Adopted and Paused are your decisions.">
            <select value={form.status || ""} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="">Auto (follows the evidence)</option>
              {TACTIC_STATUSES.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Notes (optional)" wide>
            <textarea rows={3} value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What exactly counts as using this tactic?" />
          </Field>
        </div>
        {error && <div className="error" role="alert">{error}</div>}
        <div className="dialog-footer">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn primary" disabled={busy}>Save tactic</button>
        </div>
      </form>
    </Dialog>
  );
}

function Library({ state, mutate, mutateMany, statusFilter }) {
  const [editing, setEditing] = useState(null);
  const [confirm, setConfirm] = useState("");
  const usage = (id) => state.posts.filter((p) => (p.tacticIds || []).includes(id));
  const groups = CATEGORIES.map(([id, label]) => [
    id,
    label,
    state.tactics.filter((t) => (t.category || "other") === id && (!statusFilter || tacticLifecycle(state, t).status === statusFilter)),
  ]).filter(([, , l]) => l.length);
  const setStatus = (t, value) => {
    const { status: _old, ...rest } = t;
    return mutate("tactics", value ? { ...rest, status: value } : rest);
  };
  const remove = async (t) => {
    await mutateMany([
      ...state.theories
        .filter((th) => th.tacticId === t.id)
        .map((th) => ({ op: "delete", collection: "theories", id: th.id })),
      // Keep saved learnings, just detach them from the deleted tactic.
      ...state.practices
        .filter((p) => p.tacticId === t.id)
        .map((p) => {
          const { tacticId: _gone, ...rest } = p;
          return { op: "upsert", collection: "practices", value: rest };
        }),
      ...usage(t.id).map((p) => ({ op: "upsert", collection: "posts", value: { ...p, tacticIds: p.tacticIds.filter((x) => x !== t.id) } })),
      { op: "delete", collection: "tactics", id: t.id },
    ]);
    setConfirm("");
  };
  return (
    <section className="panel">
      <div className="section-label">
        <h3>My tactics</h3>
        <button className="btn primary small" onClick={() => setEditing({})}>
          <Plus size={15} /> Add a tactic
        </button>
      </div>
      {editing && <TacticForm initial={editing} onSave={(t) => mutate("tactics", t)} onClose={() => setEditing(null)} />}
      {!state.tactics.length && <p className="muted">No tactics yet. Add your own, or pick some from the Suggestions tab.</p>}
      {groups.map(([id, label, list]) => (
        <div key={id}>
          <h4>{label}</h4>
          {list.map((t) => {
            const n = usage(t.id).length;
            const life = tacticLifecycle(state, t);
            return (
              <div className="video-row library-row" key={t.id}>
                <span title={t.description || t.name}>{t.name}</span>
                <span className="status-cell">
                  <select
                    aria-label={`Status of ${t.name}`}
                    value={t.status || ""}
                    title={life.reason}
                    onChange={(e) => setStatus(t, e.target.value)}
                  >
                    <option value="">Auto · {TACTIC_STATUSES.find(([v]) => v === life.status)?.[1]}</option>
                    {TACTIC_STATUSES.map(([v, label]) => (
                      <option key={v} value={v}>
                        {label}
                      </option>
                    ))}
                  </select>
                </span>
                <small className="muted">{n} video{n === 1 ? "" : "s"}</small>
                <button className="icon-btn" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                  <Pencil size={15} />
                </button>
                {confirm === t.id ? (
                  <span>
                    <button className="btn danger small" onClick={() => remove(t)}>
                      {n ? `Delete and untag ${n}` : "Delete"}
                    </button>{" "}
                    <button className="btn ghost small" onClick={() => setConfirm("")}>Keep</button>
                  </span>
                ) : (
                  <button className="icon-btn danger" aria-label={`Delete ${t.name}`} onClick={() => setConfirm(t.id)}>
                    <Trash2 size={15} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}

/* ---------------- Suggestions ---------------- */
function Ideas({ state, mutate, mutateMany }) {
  const have = new Set(state.tactics.map((t) => t.name.trim().toLowerCase()));
  const strategyHave = new Set(state.strategies.map((s) => s.name.trim().toLowerCase()));
  const [campaignId, setCampaignId] = useState(state.campaigns[0]?.id || "");
  const [busy, setBusy] = useState(false);
  const addTactics = async (list) => {
    setBusy(true);
    try {
      await mutateMany(list.filter((s) => !have.has(s.name.toLowerCase())).map((s) => ({ op: "upsert", collection: "tactics", value: { id: uid("tactic"), name: s.name, category: s.category } })));
    } finally {
      setBusy(false);
    }
  };
  const addStrategy = (s) =>
    mutate("strategies", {
      id: uid("strategy"),
      campaignId,
      name: s.name,
      hypothesis: s.hypothesis,
      changes: "",
      keep: "",
      status: "testing",
      reviewEveryDays: 7,
      nextReviewDate: addDays(today(), 7),
    });
  return (
    <>
      <section className="panel">
        <h3>Suggested tactics</h3>
        <p className="muted small">Starting points. Adding one copies it into My tactics, where you can rename, edit or delete it.</p>
        {CATEGORIES.map(([id, label]) => {
          const list = SUGGESTED_TACTICS.filter((s) => s.category === id);
          if (!list.length) return null;
          const missing = list.filter((s) => !have.has(s.name.toLowerCase()));
          return (
            <div key={id}>
              <div className="section-label">
                <h4>{label}</h4>
                {missing.length > 1 && (
                  <button className="btn ghost small" disabled={busy} onClick={() => addTactics(missing)}>
                    Add all {missing.length}
                  </button>
                )}
              </div>
              <div className="chip-row">
                {list.map((s) => {
                  const added = have.has(s.name.toLowerCase());
                  return (
                    <button key={s.name} type="button" className={`chip ${added ? "on" : ""}`} disabled={added || busy} onClick={() => addTactics([s])}>
                      {added ? <Check size={13} /> : <Plus size={13} />} {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </section>
      <section className="panel">
        <h3>Suggested strategies</h3>
        <p className="muted small">Strategies are the bigger approach a group of videos serves. They belong to a campaign. Edit or delete them under Campaigns & strategies.</p>
        {!state.campaigns.length ? (
          <p className="muted">Create a campaign first to add strategies to it.</p>
        ) : (
          <>
            <label className="field" style={{ maxWidth: 320 }}>
              <span>Add to campaign</span>
              <select value={campaignId} onChange={(e) => setCampaignId(e.target.value)}>
                {state.campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {SUGGESTED_STRATEGIES.map((s) => {
              const added = strategyHave.has(s.name.toLowerCase());
              return (
                <div className="video-row library-row" key={s.name}>
                  <span title={s.hypothesis}>{s.name}</span>
                  <small className="muted">{s.hypothesis}</small>
                  <span />
                  <button className="btn secondary small" disabled={added || !campaignId} onClick={() => addStrategy(s)}>
                    {added ? "Added" : "Add"}
                  </button>
                </div>
              );
            })}
          </>
        )}
      </section>
    </>
  );
}
