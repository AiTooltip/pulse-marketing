import React, { useState } from "react";
import {
  Plus,
  Trash2,
  Check,
  Info,
  LoaderCircle,
  ArrowRight,
} from "lucide-react";
import { Dialog, Field, uid, Platform, titleCase } from "./components.jsx";
import { today, addDays } from "../shared/domain.mjs";
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
  metric: "metric",
  assessment: "assessment",
  reminder: "reminder",
  practice: "best practice",
};
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
      campaignId: campaign?.id || "",
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
  onDelete,
}) {
  const { type, value, prefill } = modal;
  const [form, setForm] = useState(() => ({
    ...defaults(type, state, clientId),
    ...prefill,
    ...value,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
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
  const accountOptions = state.accounts
    .filter((a) => (type === "post" ? a.clientId === campaign?.clientId : true))
    .map((a) => ({ id: a.id, name: `${a.handle} · ${a.platform}` }));
  const campaignOptions =
    type === "metric"
      ? state.campaigns
          .filter((c) => c.clientId === account?.clientId)
          .map((c) => ({ id: c.id, name: c.name }))
      : allCampaigns;
  const strategies = state.strategies
    .filter((s) => s.campaignId === form.campaignId)
    .map((s) => ({ id: s.id, name: s.name }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      let record = { ...form, id: form.id || uid(type) };
      if (type === "campaign") {
        record.reviewEveryDays = Number(record.reviewEveryDays);
        record.goals = record.goals.map((g) => ({
          ...g,
          baseline: Number(g.baseline),
          target: Number(g.target),
        }));
      }
      if (type === "strategy")
        record.reviewEveryDays = Number(record.reviewEveryDays);
      if (type === "post")
        record.reviewAfterDays = Number(record.reviewAfterDays);
      if (type === "metric") record.value = Number(record.value);
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
      await onSave(collectionMap[type], record);
      onClose();
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
      title={`${value ? "Edit" : "Add"} ${labels[type]}`}
      description={
        type === "metric"
          ? "Record a dated observation. Use the same reporting window when comparing results."
          : type === "assessment"
            ? "Turn what happened into something you can test next."
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
                {select("platform", [
                  "Instagram",
                  "TikTok",
                  "LinkedIn",
                  "Facebook",
                  "YouTube",
                  "Pinterest",
                  "X",
                  "Other",
                ])}
              </Field>
              <Field label="Display name">
                {input("name", { required: true, placeholder: "Brand name" })}
              </Field>
              <Field label="Handle / account name">
                {input("handle", { required: true, placeholder: "@yourbrand" })}
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
                      <input
                        required
                        value={k.unit}
                        placeholder="%, people, clicks"
                        onChange={(e) =>
                          set(
                            "kpis",
                            form.kpis.map((x, j) =>
                              j === i ? { ...x, unit: e.target.value } : x,
                            ),
                          )
                        }
                      />
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
                  <h3>Account goals</h3>
                  <button
                    className="btn ghost small"
                    type="button"
                    onClick={() => {
                      const a = state.accounts.find(
                        (a) => a.clientId === form.clientId,
                      );
                      set("goals", [
                        ...form.goals,
                        {
                          id: uid("goal"),
                          accountId: a?.id || "",
                          kpiId: a?.kpis[0]?.id || "",
                          baseline: 0,
                          target: 100,
                        },
                      ]);
                    }}
                  >
                    <Plus size={15} /> Add goal
                  </button>
                </div>
                {!form.goals.length && (
                  <p className="muted small">
                    Add a starting value and target for each account KPI.
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
                  return (
                    <div className="goal-editor" key={g.id}>
                      <div className="form-grid">
                        <Field label="Social account">
                          <select
                            required
                            value={g.accountId}
                            onChange={(e) =>
                              set(
                                "goals",
                                form.goals.map((x, j) =>
                                  j === i
                                    ? {
                                        ...x,
                                        accountId: e.target.value,
                                        kpiId:
                                          state.accounts.find(
                                            (a) => a.id === e.target.value,
                                          )?.kpis[0]?.id || "",
                                      }
                                    : x,
                                ),
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
                            onChange={(e) => update("kpiId", e.target.value)}
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
                        <Field label="Starting value">
                          <input
                            type="number"
                            step="any"
                            required
                            value={g.baseline}
                            onChange={(e) => update("baseline", e.target.value)}
                          />
                        </Field>
                        <Field label="Goal value">
                          <input
                            type="number"
                            step="any"
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
              <Field label="Hypothesis" wide>
                {text(
                  "hypothesis",
                  "We believe that… because… We will measure…",
                )}
              </Field>
              <Field label="What are we changing?">
                {text("changes", "The variable we are testing")}
              </Field>
              <Field label="What stays the same?">
                {text("keep", "What we will hold constant")}
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
              {campaignChoice}
              <Field label="Social account">
                {select("accountId", accountOptions)}
              </Field>
              <Field label="Strategy">
                {select("strategyId", [
                  { id: "", name: "No strategy linked" },
                  ...strategies,
                ])}
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
                  { id: "needed", name: "Need to create / find" },
                  { id: "in-progress", name: "In progress" },
                  { id: "ready", name: "Ready to publish" },
                ])}
              </Field>
              <Field label="Status">
                {select("status", ["planned", "executed", "cancelled"])}
              </Field>
              <Field label="Assess after execution (days)">
                {input("reviewAfterDays", {
                  required: true,
                  type: "number",
                  min: 1,
                })}
              </Field>
              {form.status === "executed" && (
                <Field label="Execution date">
                  {input("executedAt", { type: "date", max: today() })}
                </Field>
              )}
              <Field label="Outline / notes" wide>
                {text(
                  "notes",
                  "General idea, creative direction, assets needed…",
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
              <Field label="Date observed">
                {input("date", { required: true, type: "date", max: today() })}
              </Field>
              <Field
                label="Value"
                hint={
                  account?.kpis.find((k) => k.id === form.kpiId)?.unit === "%"
                    ? "Enter 4.5 for 4.5%, not 0.045."
                    : null
                }
              >
                {input("value", {
                  type: "number",
                  step: "any",
                  required: true,
                })}
              </Field>
              <Field label="Campaign (optional)">
                {select(
                  "campaignId",
                  [
                    { id: "", name: "Account-level observation" },
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
                  [{ id: "", name: "None — account total" }, ...strategies],
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
                  Post and strategy observations support experiment analysis.
                  Only account-level observations contribute to overall campaign
                  goals.
                </span>
              </div>
            </>
          )}
          {type === "assessment" && (
            <>
              <Field label="Assess">
                {select("entityType", ["campaign", "strategy", "post"], (v) =>
                  setForm((f) => ({
                    ...f,
                    entityType: v,
                    entityId:
                      state[`${v === "strategy" ? "strategie" : v}s`]?.[0]
                        ?.id || "",
                  })),
                )}
              </Field>
              <Field label="Item">
                {select(
                  "entityId",
                  (
                    state[
                      {
                        campaign: "campaigns",
                        strategy: "strategies",
                        post: "posts",
                      }[form.entityType]
                    ] || []
                  ).map((x) => ({ id: x.id, name: x.name || x.title })),
                )}
              </Field>
              <Field label="Assessment date">
                {input("date", { required: true, type: "date", max: today() })}
              </Field>
              <Field label="Result">
                {select("rating", ["positive", "mixed", "negative"])}
              </Field>
              <Field label="Summary" wide>
                {text("summary", "What do the results tell us?")}
              </Field>
              <Field label="What did we do differently?">
                {text("different")}
              </Field>
              <Field label="What stayed the same?">{text("same")}</Field>
              <Field label="What worked better?">{text("better")}</Field>
              <Field label="What worked worse?">{text("worse")}</Field>
              <Field label="Next test / decision" wide>
                {text("nextTest", "One specific change to try next")}
              </Field>
              <div className="notice span-2">
                <Check size={17} />
                <span>
                  Saving schedules the next campaign or strategy assessment
                  using its review interval. A post follow-up is complete after
                  its first assessment following execution.
                </span>
              </div>
            </>
          )}
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
                  <Field label="Notify when progress is">
                    {select("comparison", ["below", "above"])}
                  </Field>
                  <Field label="Percent of goal achieved">
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
              <Field label="Practice title" wide>
                {input("title", {
                  required: true,
                  placeholder: "A useful principle to test again",
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
              <Field label="Source strategy">
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
              <Field label="Evidence" wide>
                {text(
                  "evidence",
                  "Which dated metrics and comparisons support this?",
                )}
              </Field>
              <Field label="Possible explanation" wide>
                {text(
                  "explanation",
                  "Explain the hypothesis and alternative explanations.",
                )}
              </Field>
              <Field label="Next test" wide>
                {text("nextTest", "How can we isolate why this worked?")}
              </Field>
              <Field label="Confidence">
                {select("confidence", ["hypothesis", "emerging", "validated"])}
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
          <button className="btn primary" disabled={busy}>
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
