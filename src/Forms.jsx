import { loadLibrary, saveLibraryPlatform } from "./library.js";
import React, { useState } from "react";
import {
  Plus,
  Trash2,
  Check,
  Info,
  LoaderCircle,
  ArrowRight,
} from "lucide-react";
import {
  Dialog,
  Field,
  NumInput,
  PeriodSelect,
  UNITS,
  windowLabel,
  uid,
  Platform,
  titleCase,
  fmt,
  niceDate,
} from "./components.jsx";
import { today, addDays, goalProgress } from "../shared/domain.mjs";
import MetricBatch from "./MetricBatch.jsx";
import UploadedVideo from "./UploadedVideo.jsx";
import TacticPicker, { pendingTacticOps } from "./TacticPicker.jsx";
const collectionMap = {
  client: "clients",
  account: "accounts",
  campaign: "campaigns",
  strategy: "strategies",
  post: "posts",
  metric: "metrics",
  assessment: "assessments",
  reminder: "reminders",
  practice: "practices",
};
const labels = {
  client: "client",
  account: "social account",
  campaign: "campaign",
  strategy: "strategy",
  post: "content plan",
  metric: "number",
  assessment: "assessment",
  reminder: "reminder",
  practice: "learning",
};
const TARGET_COLLECTION = {
  campaign: "campaigns",
  strategy: "strategies",
  post: "posts",
};
/** "Views: 5,200 (per week, Oct 3)" — the newest number per KPI and window. */
function latestPerKpi(state, metrics, withHandle, limit = 5) {
  const latest = new Map();
  for (const m of [...metrics].sort((a, b) => a.date.localeCompare(b.date)))
    latest.set(`${m.accountId}|${m.kpiId}|${m.periodDays || 0}`, m);
  const all = [...latest.values()].sort((a, b) => b.date.localeCompare(a.date));
  const lines = all.slice(0, limit).map((m) => {
    const account = state.accounts.find((a) => a.id === m.accountId);
    const kpi = account?.kpis.find((k) => k.id === m.kpiId);
    const when = [m.periodDays ? windowLabel(m.periodDays) : null, niceDate(m.date)]
      .filter(Boolean)
      .join(", ");
    return `${withHandle && account ? `${account.handle} ` : ""}${kpi?.name || "Number"}: ${fmt(m.value, kpi?.unit)} (${when})`;
  });
  return { lines, more: Math.max(0, all.length - limit) };
}
/** What an assessment is about, and the latest results to judge it by. */
export function reviewTarget(state, entityType, entityId) {
  const entity = (state[TARGET_COLLECTION[entityType]] || []).find(
    (x) => x.id === entityId,
  );
  if (!entity) return null;
  let found = { lines: [], more: 0 };
  if (entityType === "post")
    found = latestPerKpi(
      state,
      state.metrics.filter((m) => m.postId === entity.id),
    );
  if (entityType === "strategy") {
    const posts = new Set(
      state.posts.filter((p) => p.strategyId === entity.id).map((p) => p.id),
    );
    const rows = state.metrics.filter(
      (m) => m.strategyId === entity.id || posts.has(m.postId),
    );
    found = latestPerKpi(
      state,
      rows,
      new Set(rows.map((m) => m.accountId)).size > 1,
    );
  }
  if (entityType === "campaign")
    found.lines = entity.goals
      .map((g) => {
        const p = goalProgress(state, entity, g);
        if (!p.hasData) return null;
        const account = state.accounts.find((a) => a.id === g.accountId);
        const kpi = account?.kpis.find((k) => k.id === g.kpiId);
        return `${kpi?.name || "Goal"}${g.periodDays ? ` ${windowLabel(g.periodDays)}` : ""} (${account?.handle || "account"}): ${fmt(p.current, kpi?.unit)} of ${fmt(g.target, kpi?.unit)} · ${Math.round(p.percent)}% of the way`;
      })
      .filter(Boolean);
  return {
    label: `${titleCase(entityType)} you're reviewing`,
    title: entity.name || entity.title,
    results: found.lines,
    more: found.more,
  };
}
/** Newest whole-account running total for a KPI, if one was recorded. */
export const latestTotal = (state, accountId, kpiId, periodDays = 0) =>
  state.metrics
    .filter(
      (m) =>
        m.accountId === accountId &&
        m.kpiId === kpiId &&
        !m.postId &&
        !m.strategyId &&
        (m.periodDays || 0) === (Number(periodDays) || 0),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .at(-1) || null;

/** A blank goal, pre-filled from the client's first account and its latest number. */
export function newGoal(state, clientId, usedKeys = []) {
  const accounts = state.accounts.filter((a) => a.clientId === clientId);
  const pairs = accounts.flatMap((a) => a.kpis.map((k) => [a, k]));
  const [a, k] =
    pairs.find(([a, k]) => !usedKeys.includes(`${a.id}:${k.id}:0`)) ||
    pairs[0] ||
    [];
  const latest = a && k ? latestTotal(state, a.id, k.id) : null;
  return {
    id: uid("goal"),
    accountId: a?.id || "",
    kpiId: k?.id || "",
    baseline: latest ? String(latest.value) : "",
    target: "",
  };
}

function defaults(type, state, clientId) {
  const client =
    state.clients.find((c) => c.id === clientId) || state.clients[0];
  const campaign =
    state.campaigns.find((c) => c.clientId === client?.id) ||
    state.campaigns[0];
  const account =
    state.accounts.find((a) => a.clientId === client?.id) || state.accounts[0];
  return {
    client: { name: "", industry: "", color: "#7c9070", notes: "" },
    account: {
      clientId: client?.id || "",
      platform: "Instagram",
      name: "",
      handle: "",
      kpis: [
        {
          id: uid("kpi"),
          name: "Reach",
          unit: "people",
          direction: "increase",
        },
        {
          id: uid("kpi"),
          name: "Engagement rate",
          unit: "%",
          direction: "increase",
        },
      ],
    },
    campaign: {
      clientId: client?.id || "",
      name: "",
      objective: "",
      startDate: today(),
      endDate: addDays(today(), 30),
      status: "active",
      reviewEveryDays: 30,
      nextReviewDate: addDays(today(), 30),
      goals: [],
    },
    strategy: {
      campaignId: campaign?.id || "",
      name: "",
      hypothesis: "",
      changes: "",
      keep: "",
      status: "testing",
      reviewEveryDays: 7,
      nextReviewDate: addDays(today(), 7),
    },
    post: {
      campaignId: "",
      accountId: account?.id || "",
      strategyId: "",
      title: "",
      format: "Reel",
      date: today(),
      status: "planned",
      readiness: "needed",
      notes: "",
      url: "",
      reviewAfterDays: 7,
    },
    metric: {
      accountId: account?.id || "",
      kpiId: account?.kpis[0]?.id || "",
      campaignId: "",
      strategyId: "",
      postId: "",
      date: today(),
      value: "",
      periodDays: "",
      source: "manual",
    },
    assessment: {
      entityType: "campaign",
      entityId: campaign?.id || "",
      date: today(),
      summary: "",
      different: "",
      same: "",
      better: "",
      worse: "",
      nextTest: "",
      rating: "mixed",
    },
    reminder: {
      title: "",
      type: "date",
      date: today(),
      campaignId: campaign?.id || "",
      goalId: "",
      threshold: 50,
      comparison: "below",
      done: false,
    },
    practice: {
      title: "",
      clientId: client?.id || "",
      strategyId: "",
      evidence: "",
      explanation: "",
      nextTest: "",
      confidence: "hypothesis",
      source: "manual",
    },
  }[type];
}
export default function EntityForm({
  modal,
  state,
  clientId,
  onClose,
  onSave,
  onSaveMany,
  onDelete,
  openResults,
  openStrategy,
}) {
  const { type, value, prefill } = modal;
  const [form, setForm] = useState(() => {
    const start = {
      ...defaults(type, state, clientId),
      ...prefill,
      ...value,
    };
    // Opened from a campaign or strategy: start on one of that client's accounts.
    if (type === "post" && start.campaignId) {
      const owner = state.campaigns.find((c) => c.id === start.campaignId)?.clientId;
      const current = state.accounts.find((a) => a.id === start.accountId);
      if (owner && current?.clientId !== owner)
        start.accountId =
          state.accounts.find((a) => a.clientId === owner)?.id || start.accountId;
    }
    return start;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  // An assessment opened for a specific item hides the picker until asked.
  const [pickTarget, setPickTarget] = useState(
    () =>
      type === "assessment" &&
      !reviewTarget(
        state,
        { ...prefill, ...value }.entityType || "campaign",
        { ...prefill, ...value }.entityId,
      ),
  );
  const [customUnits, setCustomUnits] = useState([]);
  const [pendingTactics, setPendingTactics] = useState([]);
  const [addingPlatform, setAddingPlatform] = useState(false);
  const [newPlatformName, setNewPlatformName] = useState("");
  const applyNewPlatform = () => {
    const name = newPlatformName.trim();
    if (!name) return;
    saveLibraryPlatform(name);
    set("platform", name);
    setAddingPlatform(false);
    setNewPlatformName("");
  };
  const uploadPost =
    type === "metric" && form.postId
      ? state.posts.find((p) => p.id === form.postId)
      : null;
  const uploadOf = uploadPost ? uploadPost.executedAt || uploadPost.date : "";
  const addGoal = () =>
    setForm((f) => ({
      ...f,
      goals: [
        ...f.goals,
        newGoal(
          state,
          f.clientId,
          f.goals.map((g) => `${g.accountId}:${g.kpiId}:${g.periodDays || 0}`),
        ),
      ],
    }));
  const set = (key, val) => setForm((f) => ({ ...f, [key]: val }));
  const input = (key, props = {}) => (
    <input
      value={form[key] ?? ""}
      onChange={(e) => set(key, e.target.value)}
      {...props}
    />
  );
  const text = (key, placeholder = "", rows = 3) => (
    <textarea
      required={type === "assessment" && key === "summary"}
      rows={rows}
      placeholder={placeholder}
      value={form[key] || ""}
      onChange={(e) => set(key, e.target.value)}
    />
  );
  const select = (key, options, handler) => (
    <select
      value={form[key] || ""}
      onChange={(e) =>
        handler ? handler(e.target.value) : set(key, e.target.value)
      }
    >
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {titleCase(o)}
          </option>
        ) : (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ),
      )}
    </select>
  );
  const clientOptions = state.clients.map((c) => ({ id: c.id, name: c.name }));
  const allCampaigns = state.campaigns.map((c) => ({ id: c.id, name: c.name }));
  const account = state.accounts.find((a) => a.id === form.accountId);
  const campaign = state.campaigns.find((c) => c.id === form.campaignId);
  const multiClient = state.clients.length > 1;
  const accountOptions = state.accounts.map((a) => ({
    id: a.id,
    name: `${a.handle} · ${a.platform}${
      multiClient && type === "post"
        ? ` (${state.clients.find((c) => c.id === a.clientId)?.name || "No client"})`
        : ""
    }`,
  }));
  // A post's campaign must belong to the same client as its account.
  const postCampaigns = state.campaigns
    .filter((c) => !account || c.clientId === account.clientId)
    .map((c) => ({ id: c.id, name: c.name }));
  const campaignOptions =
    type === "metric"
      ? state.campaigns
          .filter((c) => c.clientId === account?.clientId)
          .map((c) => ({ id: c.id, name: c.name }))
      : allCampaigns;
  const strategies = state.strategies
    .filter((s) =>
      form.campaignId
        ? s.campaignId === form.campaignId
        : type === "post" &&
          state.campaigns.find((c) => c.id === s.campaignId)?.clientId ===
            account?.clientId,
    )
    .map((s) => ({ id: s.id, name: s.name }));
  if (type === "video")
    return (
      <UploadedVideo
        state={state}
        clientId={clientId}
        prefill={prefill}
        onSaveMany={onSaveMany}
        onClose={onClose}
        openResults={openResults}
      />
    );
  if (type === "metric" && !value)
    return (
      <MetricBatch
        state={state}
        prefill={prefill}
        clientId={clientId}
        onSaveMany={onSaveMany}
        onClose={onClose}
        openStrategy={openStrategy}
        openResults={openResults}
      />
    );
  const addResultsAfter = React.useRef(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let record = { ...form, id: form.id || uid(type) };
      delete record.duplicateOf;
      if (type === "client" && !record.startDate) delete record.startDate;
      if (type === "account") {
        record.name = (record.name || "").trim();
        record.handle =
          (record.handle || "").trim() || record.name || record.platform;
      }
      if (type === "campaign") {
        record.reviewEveryDays = Number(record.reviewEveryDays);
        record.goals = record.goals.map(({ periodDays, ...g }) => ({
          ...g,
          baseline: Number(g.baseline),
          target: Number(g.target),
          ...(periodDays && Number(periodDays) >= 1
            ? { periodDays: Math.round(Number(periodDays)) }
            : {}),
        }));
      }
      if (type === "strategy") {
        record.reviewEveryDays = Number(record.reviewEveryDays);
        // Once the strategy is explained, stop asking for details.
        if (record.needsDetails && (record.hypothesis || "").trim())
          delete record.needsDetails;
      }
      if (type === "post") {
        record.reviewAfterDays = Number(record.reviewAfterDays);
        // Tactics were added, so stop the "add tactics later" reminder.
        if ((record.tacticIds || []).length) delete record.tacticsLater;
        if (record.strategyId) delete record.strategyLater;
      }
      if (type === "metric") {
        record.value = Number(record.value);
        if (record.periodDays && Number(record.periodDays) >= 1)
          record.periodDays = Math.round(Number(record.periodDays));
        else delete record.periodDays;
      }
      if (type === "reminder") {
        record.threshold = Number(record.threshold);
        if (!record.date) delete record.date;
      }
      for (const k of [
        "campaignId",
        "strategyId",
        "postId",
        "clientId",
        "goalId",
      ])
        if (record[k] === "") delete record[k];
      // Numbers saved with an older strategy on this video would block a change.
      const staleMetrics =
        type === "post"
          ? state.metrics.filter(
              (m) => m.postId === record.id && m.strategyId && m.strategyId !== record.strategyId,
            )
          : [];
      if (type === "post" && (pendingTactics.length || staleMetrics.length))
        await onSaveMany([
          ...pendingTacticOps(pendingTactics, record.tacticIds || []),
          { op: "upsert", collection: "posts", value: record },
          ...staleMetrics.map((m) => {
            const { strategyId: _s, ...rest } = m;
            return { op: "upsert", collection: "metrics", value: rest };
          }),
        ]);
      else await onSave(collectionMap[type], record);
      onClose();
      if (type === "post" && addResultsAfter.current) openResults?.(record);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  const del = async () => {
    setBusy(true);
    setError("");
    try {
      await onDelete(collectionMap[type], value.id);
      onClose();
    } catch (err) {
      setError(err.message);
      setConfirmDelete(false);
    } finally {
      setBusy(false);
    }
  };
  const campaignChoice = (
    <Field label="Campaign">
      {select("campaignId", campaignOptions, (v) =>
        setForm((f) => ({
          ...f,
          campaignId: v,
          strategyId: "",
          postId: "",
          ...(type === "post"
            ? {
                accountId:
                  state.accounts.find(
                    (a) =>
                      a.clientId ===
                      state.campaigns.find((c) => c.id === v)?.clientId,
                  )?.id || "",
              }
            : {}),
        })),
      )}
    </Field>
  );
  return (
    <Dialog
      title={`${value ? "Edit" : prefill.duplicateOf ? "Duplicate" : "Add"} ${labels[type]}`}
      description={
        type === "metric"
          ? "Change the number or date for this entry."
          : type === "assessment"
            ? "Write down what happened so you know what to try next."
            : type === "post" && prefill.duplicateOf
              ? "This is a copy. Change the date, account or idea, then save it as a new plan."
              : null
      }
      onClose={onClose}
      wide={["campaign", "assessment", "strategy", "post", "practice"].includes(
        type,
      )}
    >
      <form onSubmit={submit}>
        <div className="form-grid">
          {type === "client" && (
            <>
              <Field label="Brand / client name">
                {input("name", {
                  required: true,
                  placeholder: "e.g. Your brand",
                })}
              </Field>
              <Field label="Industry">
                {input("industry", {
                  placeholder: "e.g. Lifestyle & interiors",
                })}
              </Field>
              <Field label="Brand color">
                {input("color", { type: "color" })}
              </Field>
              <Field
                label="Date you started with this client"
                hint="Numbers before this date count as 'before', numbers after as 'after'."
              >
                {input("startDate", { type: "date", max: today() })}
              </Field>
              <Field label="Notes" wide>
                {text(
                  "notes",
                  "Audience, positioning, things to keep in mind…",
                )}
              </Field>
            </>
          )}
          {type === "account" && (
            <>
              <Field label="Client">{select("clientId", clientOptions)}</Field>
              <Field label="Platform">
                <select
                  value={addingPlatform ? "__new__" : form.platform || ""}
                  onChange={(e) =>
                    e.target.value === "__new__"
                      ? setAddingPlatform(true)
                      : (setAddingPlatform(false), set("platform", e.target.value))
                  }
                >
                  {[
                    "Instagram",
                    "TikTok",
                    "LinkedIn",
                    "Facebook",
                    "YouTube",
                    "Pinterest",
                    "X",
                    ...loadLibrary().platforms,
                    ...(form.platform ? [form.platform] : []),
                  ]
                    .filter((p, i, l) => l.indexOf(p) === i)
                    .map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  <option value="__new__">+ Add a new platform…</option>
                </select>
                {addingPlatform && (
                  <div className="chip-add">
                    <input
                      autoFocus
                      aria-label="New platform name"
                      placeholder="e.g. Newsletter, Website, Snapchat"
                      value={newPlatformName}
                      onChange={(e) => setNewPlatformName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          applyNewPlatform();
                        }
                      }}
                    />
                    <button
                      type="button"
                      className="btn ghost small"
                      disabled={!newPlatformName.trim()}
                      onClick={applyNewPlatform}
                    >
                      <Plus size={14} /> Use &amp; save
                    </button>
                  </div>
                )}
              </Field>
              <Field label="Display name">
                {input("name", { placeholder: "Brand name (optional)" })}
              </Field>
              <Field label="Handle / account name">
                {input("handle", { placeholder: "@yourbrand (optional)" })}
              </Field>
              <div className="span-2">
                <div className="section-label">
                  <h3>Choose the KPIs you track</h3>
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() =>
                      set("kpis", [
                        ...form.kpis,
                        {
                          id: uid("kpi"),
                          name: "",
                          unit: "count",
                          direction: "increase",
                        },
                      ])
                    }
                  >
                    <Plus size={15} /> Add KPI
                  </button>
                </div>
                {form.kpis.map((k, i) => (
                  <div className="kpi-editor" key={k.id}>
                    <Field label="KPI name">
                      <input
                        required
                        value={k.name}
                        onChange={(e) =>
                          set(
                            "kpis",
                            form.kpis.map((x, j) =>
                              j === i ? { ...x, name: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </Field>
                    <Field label="Unit">
                      <select
                        value={
                          customUnits.includes(k.id) ||
                          (k.unit && !UNITS.includes(k.unit))
                            ? "__other__"
                            : k.unit
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          if (v === "__other__")
                            setCustomUnits((l) => [...new Set([...l, k.id])]);
                          else setCustomUnits((l) => l.filter((x) => x !== k.id));
                          set(
                            "kpis",
                            form.kpis.map((x, j) =>
                              j === i
                                ? { ...x, unit: v === "__other__" ? "" : v }
                                : x,
                            ),
                          );
                        }}
                      >
                        {UNITS.map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                        <option value="__other__">Other…</option>
                      </select>
                      {(customUnits.includes(k.id) ||
                        (k.unit && !UNITS.includes(k.unit))) && (
                        <input
                          required
                          aria-label="Custom unit"
                          placeholder="Type your unit"
                          value={k.unit}
                          onChange={(e) =>
                            set(
                              "kpis",
                              form.kpis.map((x, j) =>
                                j === i ? { ...x, unit: e.target.value } : x,
                              ),
                            )
                          }
                        />
                      )}
                    </Field>
                    <Field label="Better when">
                      <select
                        value={k.direction}
                        onChange={(e) =>
                          set(
                            "kpis",
                            form.kpis.map((x, j) =>
                              j === i ? { ...x, direction: e.target.value } : x,
                            ),
                          )
                        }
                      >
                        <option value="increase">Increasing</option>
                        <option value="decrease">Decreasing</option>
                      </select>
                    </Field>
                    <button
                      className="icon-btn danger"
                      type="button"
                      aria-label={`Remove ${k.name || "KPI"}`}
                      onClick={() =>
                        set(
                          "kpis",
                          form.kpis.filter((_, j) => j !== i),
                        )
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
                <p className="muted small">
                  You can add custom KPIs at any time. KPIs used by recorded
                  metrics or campaign goals cannot be removed.
                </p>
              </div>
            </>
          )}
          {type === "campaign" && (
            <>
              <Field label="Campaign name">
                {input("name", {
                  required: true,
                  placeholder: "Give this campaign a name",
                })}
              </Field>
              <Field label="Client">
                {select("clientId", clientOptions, (v) =>
                  setForm((f) => ({ ...f, clientId: v, goals: [] })),
                )}
              </Field>
              <Field label="Objective" wide>
                {text("objective", "What does success look like?")}
              </Field>
              <Field label="Start date">
                {input("startDate", { required: true, type: "date" })}
              </Field>
              <Field label="End date">
                {input("endDate", {
                  required: true,
                  type: "date",
                  min: form.startDate,
                })}
              </Field>
              <Field label="Status">
                {select("status", ["active", "planned", "paused", "completed"])}
              </Field>
              <Field label="Assess every (days)">
                {input("reviewEveryDays", {
                  type: "number",
                  min: 1,
                  required: true,
                  onChange: (e) => {
                    const n = Number(e.target.value);
                    setForm((f) => ({
                      ...f,
                      reviewEveryDays: e.target.value,
                      ...(!value && n > 0 && n <= 3650
                        ? { nextReviewDate: addDays(today(), n) }
                        : {}),
                    }));
                  },
                })}
              </Field>
              <Field label="Next assessment">
                {input("nextReviewDate", { required: true, type: "date" })}
              </Field>
              <div className="span-2 goals-editor">
                <div className="section-label">
                  <h3>Goals for this campaign</h3>
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={addGoal}
                  >
                    <Plus size={15} /> Add a goal
                  </button>
                </div>
                <p className="muted small">
                  A goal is <strong>one KPI on one account</strong>: where it
                  stands when the campaign starts and the number you want it to
                  reach by the end date. Add one goal per KPI you want to move.
                  Progress is measured from the running totals you record.
                </p>
                {!state.accounts.some((a) => a.clientId === form.clientId) && (
                  <p className="muted small">
                    This client has no social accounts yet. Add an account and
                    its KPIs first, then come back to set goals.
                  </p>
                )}
                {!form.goals.length && (
                  <p className="muted small">
                    No goals yet. Click <strong>Add a goal</strong>, choose the
                    account and KPI, then fill in &ldquo;Where it starts&rdquo;
                    and &ldquo;Target&rdquo;.
                  </p>
                )}
                {form.goals.map((g, i) => {
                  const a = state.accounts.find((a) => a.id === g.accountId);
                  const update = (k, v) =>
                    set(
                      "goals",
                      form.goals.map((x, j) =>
                        j === i ? { ...x, [k]: v } : x,
                      ),
                    );
                  const k = a?.kpis.find((k) => k.id === g.kpiId);
                  const latest = latestTotal(
                    state,
                    g.accountId,
                    g.kpiId,
                    g.periodDays,
                  );
                  const pick = (accountId, kpiId, periodDays = g.periodDays) => {
                    const l = latestTotal(state, accountId, kpiId, periodDays);
                    set(
                      "goals",
                      form.goals.map((x, j) =>
                        j === i
                          ? {
                              ...x,
                              accountId,
                              kpiId,
                              periodDays,
                              ...(l ? { baseline: String(l.value) } : {}),
                            }
                          : x,
                      ),
                    );
                  };
                  return (
                    <div className="goal-editor" key={g.id}>
                      <h4 className="goal-editor-title">
                        Goal {i + 1}
                        {k ? `: ${k.name}` : ""}
                        {g.periodDays ? ` (${windowLabel(g.periodDays)})` : ""}
                        {a ? ` on ${a.platform}` : ""}
                      </h4>
                      <div className="form-grid">
                        <Field label="Social account">
                          <select
                            required
                            value={g.accountId}
                            onChange={(e) =>
                              pick(
                                e.target.value,
                                state.accounts.find(
                                  (a) => a.id === e.target.value,
                                )?.kpis[0]?.id || "",
                              )
                            }
                          >
                            <option value="" disabled>
                              Select an account
                            </option>
                            {state.accounts
                              .filter((a) => a.clientId === form.clientId)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.handle} · {a.platform}
                                </option>
                              ))}
                          </select>
                        </Field>
                        <Field label="KPI">
                          <select
                            required
                            value={g.kpiId}
                            onChange={(e) => pick(g.accountId, e.target.value)}
                          >
                            <option value="" disabled>
                              Select KPI
                            </option>
                            {a?.kpis.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.name} ({k.unit})
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field
                          label="Measured as"
                          hint="Pick Per month (or week/day) to set a goal like “5,000 website visitors per month” instead of an overall total."
                          wide
                        >
                          <PeriodSelect
                            goal
                            value={g.periodDays ?? ""}
                            onChange={(v) => pick(g.accountId, g.kpiId, v)}
                          />
                        </Field>
                        <Field
                          label="Where it starts"
                          hint={
                            latest
                              ? `Latest recorded: ${fmt(latest.value, k?.unit)} on ${niceDate(latest.date)}`
                              : "No number recorded yet. Type where it stands now."
                          }
                        >
                          <NumInput
                            unit={k?.unit}
                            required
                            value={g.baseline}
                            onChange={(e) => update("baseline", e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Target"
                          hint="The number you want to reach by the campaign end date."
                        >
                          <NumInput
                            unit={k?.unit}
                            required
                            value={g.target}
                            onChange={(e) => update("target", e.target.value)}
                          />
                        </Field>
                      </div>
                      <button
                        className="btn ghost danger small"
                        type="button"
                        onClick={() =>
                          set(
                            "goals",
                            form.goals.filter((_, j) => j !== i),
                          )
                        }
                      >
                        <Trash2 size={14} /> Remove goal
                      </button>
                    </div>
                  );
                })}
                {form.goals.length > 0 && (
                  <button
                    className="btn secondary small"
                    type="button"
                    onClick={addGoal}
                  >
                    <Plus size={15} /> Add another goal
                  </button>
                )}
              </div>
            </>
          )}
          {type === "strategy" && (
            <>
              <Field label="Strategy name">
                {input("name", {
                  required: true,
                  placeholder: "e.g. Show the process",
                })}
              </Field>
              {campaignChoice}
              <Field label="What do you expect to happen?" wide>
                {text(
                  "hypothesis",
                  "e.g. We think showing the process will get more people watching to the end, because it feels more personal.",
                )}
              </Field>
              <Field label="What are you changing?">
                {text("changes", "The one thing you are trying differently")}
              </Field>
              <Field label="What stays the same?">
                {text("keep", "e.g. same length and posting time")}
              </Field>
              <Field label="Status">
                {select("status", [
                  "testing",
                  "promising",
                  "adopted",
                  "paused",
                ])}
              </Field>
              <Field label="Assess every (days)">
                {input("reviewEveryDays", {
                  type: "number",
                  required: true,
                  min: 1,
                  onChange: (e) => {
                    const n = Number(e.target.value);
                    setForm((f) => ({
                      ...f,
                      reviewEveryDays: e.target.value,
                      ...(!value && n > 0 && n <= 3650
                        ? { nextReviewDate: addDays(today(), n) }
                        : {}),
                    }));
                  },
                })}
              </Field>
              <Field label="Next assessment">
                {input("nextReviewDate", { required: true, type: "date" })}
              </Field>
            </>
          )}
          {type === "post" && (
            <>
              <Field label="Content idea" wide>
                {input("title", {
                  required: true,
                  placeholder: "What is this post about?",
                })}
              </Field>
              <Field label="Social account">
                {select("accountId", accountOptions, (v) =>
                  setForm((f) => {
                    const next = state.accounts.find((a) => a.id === v);
                    const keep =
                      state.campaigns.find((c) => c.id === f.campaignId)
                        ?.clientId === next?.clientId;
                    return keep
                      ? { ...f, accountId: v }
                      : { ...f, accountId: v, campaignId: "", strategyId: "" };
                  }),
                )}
              </Field>
              <Field label="Campaign (optional)">
                {select(
                  "campaignId",
                  [{ id: "", name: "No campaign" }, ...postCampaigns],
                  (v) =>
                    setForm((f) => ({
                      ...f,
                      campaignId: v,
                      strategyId: "",
                      ...(v
                        ? {
                            accountId:
                              state.accounts.find(
                                (a) =>
                                  a.clientId ===
                                  state.campaigns.find((c) => c.id === v)?.clientId,
                              )?.id || f.accountId,
                          }
                        : {}),
                    })),
                )}
              </Field>
              <Field label="Strategy (the bigger approach, optional)">
                {select("strategyId", [
                  { id: "", name: "No strategy linked" },
                  ...strategies,
                ])}
              </Field>
              <Field label="Tactics used (several allowed)" wide>
                <TacticPicker
                  state={state}
                  value={form.tacticIds || []}
                  onChange={(ids) => set("tacticIds", ids)}
                  pending={pendingTactics}
                  setPending={setPendingTactics}
                />
              </Field>
              <Field label="Format">
                {select("format", [
                  "Reel",
                  "Video",
                  "Post",
                  "Carousel",
                  "Story",
                  "Article",
                ])}
              </Field>
              <Field label="Planned date">
                {input("date", { required: true, type: "date" })}
              </Field>
              <Field label="Content readiness">
                {select("readiness", [
                  { id: "needed", name: "To create" },
                  { id: "in-progress", name: "In progress" },
                  { id: "ready", name: "Ready to publish" },
                ])}
              </Field>
              <Field label="Status">
                {select("status", [
                  { id: "planned", name: "Planned" },
                  { id: "executed", name: "Published" },
                  { id: "cancelled", name: "Cancelled" },
                ])}
              </Field>
              <Field label="Check results after (days)">
                {input("reviewAfterDays", {
                  required: true,
                  type: "number",
                  min: 1,
                })}
              </Field>
              {form.status === "executed" && (
                <Field label="Date it was published">
                  {input("executedAt", { type: "date", max: today() })}
                </Field>
              )}
              <Field label="Outline / notes" wide>
                {text(
                  "notes",
                  "What the post is about, how it should look, what you still need…",
                )}
              </Field>
              <Field label="Published URL (optional)" wide>
                {input("url", { type: "url", placeholder: "https://…" })}
              </Field>
            </>
          )}
          {type === "metric" && (
            <>
              <Field label="Social account">
                {select("accountId", accountOptions, (v) =>
                  setForm((f) => ({
                    ...f,
                    accountId: v,
                    kpiId:
                      state.accounts.find((a) => a.id === v)?.kpis[0]?.id || "",
                    campaignId: "",
                    strategyId: "",
                    postId: "",
                  })),
                )}
              </Field>
              <Field label="KPI">
                {select(
                  "kpiId",
                  (account?.kpis || []).map((k) => ({
                    id: k.id,
                    name: `${k.name} (${k.unit})`,
                  })),
                )}
              </Field>
              <Field label="Data collected on">
                {input("date", { required: true, type: "date", max: today() })}
              </Field>
              {uploadOf && (
                <Field
                  label="Days after upload"
                  hint={`Video uploaded ${uploadOf}. Changing this moves the date, and changing the date updates this.`}
                >
                  <input
                    type="number"
                    min="0"
                    value={
                      form.date
                        ? Math.round(
                            (new Date(`${form.date}T12:00:00Z`) -
                              new Date(`${uploadOf}T12:00:00Z`)) /
                              86400000,
                          )
                        : ""
                    }
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (e.target.value === "" || !(n >= 0)) return;
                      const d = addDays(uploadOf, n);
                      set("date", d > today() ? today() : d);
                    }}
                  />
                </Field>
              )}
              <Field
                label="Type of number"
                hint="Running total = where it stands on that date. “Over 7 days” = e.g. a video's first-week views or this week's channel views, dated at the end of the period."
                wide
              >
                <PeriodSelect
                  value={form.periodDays ?? ""}
                  onChange={(v) => set("periodDays", v)}
                />
              </Field>
              <Field
                label="Value"
                hint={
                  account?.kpis.find((k) => k.id === form.kpiId)?.unit === "%"
                    ? "Enter 4.5 for 4.5%, not 0.045."
                    : null
                }
              >
                <NumInput
                  unit={account?.kpis.find((k) => k.id === form.kpiId)?.unit}
                  required
                  value={form.value ?? ""}
                  onChange={(e) => set("value", e.target.value)}
                />
              </Field>
              <Field label="Campaign (optional)">
                {select(
                  "campaignId",
                  [
                    { id: "", name: "Whole account (counts toward goals)" },
                    ...campaignOptions,
                  ],
                  (v) =>
                    setForm((f) => ({
                      ...f,
                      campaignId: v,
                      strategyId: "",
                      postId: "",
                    })),
                )}
              </Field>
              <Field label="Strategy (optional)">
                {select(
                  "strategyId",
                  [{ id: "", name: "None" }, ...strategies],
                  (v) => setForm((f) => ({ ...f, strategyId: v, postId: "" })),
                )}
              </Field>
              <Field label="Post (optional)" wide>
                {select(
                  "postId",
                  [
                    { id: "", name: "None" },
                    ...state.posts
                      .filter(
                        (p) =>
                          p.accountId === form.accountId &&
                          p.campaignId === form.campaignId &&
                          (!form.strategyId ||
                            p.strategyId === form.strategyId),
                      )
                      .map((p) => ({ id: p.id, name: p.title })),
                  ],
                  (v) =>
                    setForm((f) => ({
                      ...f,
                      postId: v,
                      ...(v
                        ? {
                            strategyId:
                              state.posts.find((p) => p.id === v)?.strategyId ||
                              "",
                          }
                        : {}),
                    })),
                )}
              </Field>
              <div className="notice span-2">
                <Info size={17} />
                <span>
                  Numbers linked to a post or strategy are used to compare what
                  worked. Only whole-account numbers (no post or strategy) count
                  toward a campaign's goal progress.
                </span>
              </div>
            </>
          )}
          {type === "assessment" &&
            (() => {
              const target = reviewTarget(state, form.entityType, form.entityId);
              // Based on the saved record, so the section never folds shut
              // while you are typing in it.
              const hasDetail = ["same", "better", "worse"].some((k) =>
                (value?.[k] || "").trim(),
              );
              return (
                <>
                  {target && (
                    <div className="review-target span-2">
                      <span className="review-target-label">{target.label}</span>
                      <strong>{target.title}</strong>
                      {target.results.length ? (
                        <ul>
                          {target.results.map((r) => (
                            <li key={r}>{r}</li>
                          ))}
                          {target.more > 0 && (
                            <li className="muted">
                              and {target.more} more recorded
                            </li>
                          )}
                        </ul>
                      ) : (
                        <p>
                          No numbers are recorded for this yet, so the
                          assessment will rest on what you observed.
                        </p>
                      )}
                    </div>
                  )}
                  {pickTarget || !target ? (
                    <>
                      <Field label="What are you reviewing?">
                        {select(
                          "entityType",
                          ["campaign", "strategy", "post"],
                          (v) =>
                            setForm((f) => ({
                              ...f,
                              entityType: v,
                              entityId:
                                state[TARGET_COLLECTION[v]]?.[0]?.id || "",
                            })),
                        )}
                      </Field>
                      <Field label="Which one?">
                        {select(
                          "entityId",
                          (state[TARGET_COLLECTION[form.entityType]] || []).map(
                            (x) => ({ id: x.id, name: x.name || x.title }),
                          ),
                        )}
                      </Field>
                    </>
                  ) : (
                    <div className="span-2 review-target-switch">
                      <button
                        type="button"
                        className="text-btn"
                        onClick={(e) => {
                          const form = e.currentTarget.form;
                          setPickTarget(true);
                          // The link disappears, so move focus to the new picker.
                          requestAnimationFrame(() =>
                            form?.querySelector("select")?.focus(),
                          );
                        }}
                      >
                        Review something else
                      </button>
                    </div>
                  )}
                  <Field label="Date">
                    {input("date", { required: true, type: "date", max: today() })}
                  </Field>
                  <Field label="How did it go?">
                    {select("rating", [
                      { id: "positive", name: "Went well" },
                      { id: "mixed", name: "Mixed results" },
                      { id: "negative", name: "Did not go well" },
                    ])}
                  </Field>
                  <Field label="Summary" wide>
                    {text(
                      "summary",
                      "In a sentence or two: what happened, and what does it tell you?",
                    )}
                  </Field>
                  <Field label="What did you change?">{text("different")}</Field>
                  <Field label="What will you try next?">
                    {text("nextTest", "One specific change to test next")}
                  </Field>
                  <details className="span-2 more-detail" open={hasDetail}>
                    <summary>
                      More detail (optional): what stayed the same, got better
                      or got worse
                    </summary>
                    <div className="form-grid">
                      <Field label="What stayed the same?">{text("same")}</Field>
                      <Field label="What got better?">{text("better")}</Field>
                      <Field label="What got worse?" wide>
                        {text("worse")}
                      </Field>
                    </div>
                  </details>
                  <div className="notice span-2">
                    <Check size={17} />
                    <span>
                      When you save, the next assessment for this campaign or
                      strategy is scheduled automatically from its interval. For
                      a post, the reminder to review results goes away once you
                      have written its first assessment.
                    </span>
                  </div>
                </>
              );
            })()}
          {type === "reminder" && (
            <>
              <Field label="Reminder" wide>
                {input("title", {
                  required: true,
                  placeholder: "What should you check?",
                })}
              </Field>
              <Field label="Type">
                {select("type", [
                  { id: "date", name: "On a date" },
                  { id: "progress", name: "At a progress threshold" },
                ])}
              </Field>
              {campaignChoice}
              <Field
                label={
                  form.type === "date"
                    ? "Due date"
                    : "Start checking on (optional)"
                }
              >
                {input("date", {
                  type: "date",
                  required: form.type === "date",
                })}
              </Field>
              {form.type === "progress" && (
                <>
                  <Field label="Campaign goal">
                    {select("goalId", [
                      { id: "", name: "Choose a goal" },
                      ...(campaign?.goals || []).map((g) => ({
                        id: g.id,
                        name: `${state.accounts.find((a) => a.id === g.accountId)?.handle} · ${state.accounts.find((a) => a.id === g.accountId)?.kpis.find((k) => k.id === g.kpiId)?.name}`,
                      })),
                    ])}
                  </Field>
                  <Field label="Remind me when progress is">
                    {select("comparison", ["below", "above"])}
                  </Field>
                  <Field label="Percent of the way to the goal">
                    {input("threshold", {
                      type: "number",
                      required: true,
                      min: 0,
                      max: 1000,
                    })}
                  </Field>
                </>
              )}
            </>
          )}
          {type === "practice" && (
            <>
              <Field label="What did you learn?" wide>
                {input("title", {
                  required: true,
                  placeholder: "e.g. Behind-the-scenes videos get more reach than product photos",
                })}
              </Field>
              <Field label="Client">
                {select(
                  "clientId",
                  [{ id: "", name: "All clients" }, ...clientOptions],
                  (v) =>
                    setForm((f) => ({ ...f, clientId: v, strategyId: "" })),
                )}
              </Field>
              <Field label="Which strategy was this from?">
                {select("strategyId", [
                  { id: "", name: "Not linked" },
                  ...state.strategies
                    .filter(
                      (s) =>
                        !form.clientId ||
                        state.campaigns.find((c) => c.id === s.campaignId)
                          ?.clientId === form.clientId,
                    )
                    .map((s) => ({ id: s.id, name: s.name })),
                ])}
              </Field>
              <Field label="What did you see?" wide>
                {text(
                  "evidence",
                  "The numbers or posts that back this up, with dates.",
                )}
              </Field>
              <Field label="Why do you think it worked?" wide>
                {text(
                  "explanation",
                  "Your best guess, and anything else that could explain it.",
                )}
              </Field>
              <Field label="What should you test next?" wide>
                {text("nextTest", "One small change that would confirm it, e.g. try a 15-second version.")}
              </Field>
              <Field label="How sure are you?">
                {select("confidence", [
                  { id: "hypothesis", name: "Just an idea" },
                  { id: "emerging", name: "Looking likely" },
                  { id: "validated", name: "Proven" },
                ])}
              </Field>
            </>
          )}
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {confirmDelete && (
          <div className="error">
            Delete this {labels[type]}? Linked records must be removed or
            reassigned first.{" "}
            <button
              type="button"
              className="btn danger"
              disabled={busy}
              onClick={del}
            >
              Confirm delete
            </button>
          </div>
        )}
        <div className="dialog-footer">
          {value && (
            <button
              type="button"
              className="btn ghost danger delete-button"
              onClick={() => setConfirmDelete((v) => !v)}
              disabled={busy}
            >
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button
            type="button"
            className="btn secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          {type === "post" && !value && form.status === "executed" && (
            <button
              className="btn secondary"
              disabled={busy}
              title="Save the post, then record its numbers"
              onClick={() => {
                addResultsAfter.current = true;
              }}
            >
              Save &amp; add results now
            </button>
          )}
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => {
              addResultsAfter.current = false;
            }}
          >
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{" "}
            Save {labels[type]}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
