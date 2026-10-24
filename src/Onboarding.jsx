import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LoaderCircle,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Dialog, Field, NumInput, PeriodSelect, Platform, UNITS, uid, windowLabel } from "./components.jsx";
import { addDays, today } from "../shared/domain.mjs";
import {
  loadLibrary,
  removeLibraryKpi,
  saveLibraryKpi,
  saveLibraryPlatform,
} from "./library.js";

const PLATFORMS = [
  "Instagram",
  "TikTok",
  "LinkedIn",
  "Facebook",
  "YouTube",
  "Pinterest",
  "X",
];
const ADD_NEW = "__add_new__";
const PRESETS = {
  Instagram: [
    ["Followers", "people"],
    ["Reach", "people"],
    ["Engagement rate", "%"],
    ["Profile visits", "count"],
  ],
  TikTok: [
    ["Followers", "people"],
    ["Video views", "views"],
    ["Engagement rate", "%"],
  ],
  LinkedIn: [
    ["Followers", "people"],
    ["Impressions", "count"],
    ["Engagement rate", "%"],
  ],
  Facebook: [
    ["Page followers", "people"],
    ["Reach", "people"],
    ["Engagement rate", "%"],
  ],
  YouTube: [
    ["Subscribers", "people"],
    ["Views", "views"],
    ["Watch time", "hours"],
  ],
  Pinterest: [
    ["Followers", "people"],
    ["Monthly viewers", "people"],
    ["Saves", "count"],
  ],
  X: [
    ["Followers", "people"],
    ["Impressions", "count"],
    ["Engagement rate", "%"],
  ],
};
const GENERIC = [
  ["Followers", "people"],
  ["Reach", "people"],
  ["Engagement rate", "%"],
];
const STEPS = ["Client", "Accounts & KPIs", "Campaign", "Review"];

const kpisFor = (platform) =>
  (PRESETS[platform] || GENERIC).map(([name, unit]) => ({
    id: uid("kpi"),
    name,
    unit,
    on: false,
  }));
const newAccount = (platform = "Instagram") => ({
  key: uid("acct"),
  platform,
  name: "",
  handle: "",
  kpis: kpisFor(platform),
});

export default function Onboarding({ onSaveMany, onClose, onDone, accounts: existing = [] }) {
  const [step, setStep] = useState(0);
  const [library, setLibrary] = useState(loadLibrary);
  const [newPlatform, setNewPlatform] = useState({});
  const [customUnit, setCustomUnit] = useState({});
  const platformOptions = [
    ...new Set([
      ...PLATFORMS,
      ...library.platforms,
      ...existing.map((a) => a.platform).filter(Boolean),
    ]),
  ];
  const [client, setClient] = useState({
    name: "",
    industry: "",
    color: "#7c9070",
    notes: "",
  });
  const [accounts, setAccounts] = useState([newAccount()]);
  const [startDate, setStartDate] = useState(today());
  const [campaignDateTouched, setCampaignDateTouched] = useState(false);
  const [values, setValues] = useState({});
  const [dates, setDates] = useState({});
  const [periods, setPeriods] = useState({});
  const [wantCampaign, setWantCampaign] = useState(true);
  const [campaign, setCampaign] = useState({
    name: "",
    objective: "",
    startDate: today(),
    endDate: addDays(today(), 30),
    reviewEveryDays: 30,
  });
  const [targets, setTargets] = useState({});
  const [custom, setCustom] = useState({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const used = accounts.filter(
    (a) => a.handle.trim() || a.name.trim() || a.kpis.some((k) => k.on),
  );
  const tracked = used.flatMap((a) =>
    a.kpis.filter((k) => k.on).map((k) => ({ account: a, kpi: k })),
  );
  const withStart = tracked.filter(
    ({ kpi }) => String(values[kpi.id] ?? "").trim() !== "",
  );
  const patchAccount = (key, patch) =>
    setAccounts((list) =>
      list.map((a) => (a.key === key ? { ...a, ...patch } : a)),
    );
  const patchKpi = (key, id, patch) =>
    setAccounts((list) =>
      list.map((a) =>
        a.key === key
          ? {
              ...a,
              kpis: a.kpis.map((k) => (k.id === id ? { ...k, ...patch } : k)),
            }
          : a,
      ),
    );

  const addPlatform = (key) => {
    const name = (newPlatform[key] ?? "").trim();
    if (!name) return;
    const known = platformOptions.find((p) => p.toLowerCase() === name.toLowerCase());
    if (!known) setLibrary(saveLibraryPlatform(name));
    const chosen = known || name;
    patchAccount(key, { platform: chosen, kpis: kpisFor(chosen), adding: false });
    setNewPlatform({ ...newPlatform, [key]: "" });
  };
  const addKpi = (a) => {
    const name = (custom[a.key] || "").trim();
    if (!name) return;
    const unit = customUnit[a.key] || "count";
    if (!a.kpis.some((k) => k.name.toLowerCase() === name.toLowerCase())) {
      setLibrary(saveLibraryKpi(name, unit));
      patchAccount(a.key, {
        kpis: [...a.kpis, { id: uid("kpi"), name, unit, on: true }],
      });
    }
    setCustom({ ...custom, [a.key]: "" });
  };
  const addSaved = (a, { name, unit }) =>
    patchAccount(a.key, {
      kpis: [...a.kpis, { id: uid("kpi"), name, unit, on: true }],
    });

  const goalRows = tracked
    .map(({ account, kpi }) => {
    const hasStart = String(values[kpi.id] ?? "").trim() !== "";
    const baseline = hasStart ? Number(values[kpi.id]) : NaN;
    const raw = String(targets[kpi.id] ?? "").trim();
    return { account, kpi, periodDays: Number(periods[kpi.id]) || 0, baseline, hasStart, raw, target: raw === "" ? null : Number(raw) };
  });
  const activeGoals = goalRows.filter((g) => g.raw !== "");

  const validate = () => {
    if (step === 0 && !client.name.trim()) return "Enter the client or brand name.";
    if (step === 1) {
      if (!used.length)
        return "Add at least one platform and KPI, or choose “Skip for now”.";
      if (used.some((a) => !a.kpis.some((k) => k.on)))
        return "Pick at least one KPI to track for every platform.";
      for (const { kpi } of tracked) {
        const v = String(values[kpi.id] ?? "").trim();
        if (v !== "" && !Number.isFinite(Number(v)))
          return `“${kpi.name}” must be a number.`;
      }
    }
    if (step === 2 && wantCampaign) {
      if (!campaign.name.trim()) return "Give the campaign a name.";
      if (campaign.endDate < campaign.startDate)
        return "The campaign cannot end before it starts.";
      if (!(Number(campaign.reviewEveryDays) >= 1))
        return "Check-in interval must be at least 1 day.";
      for (const g of activeGoals) {
        if (!Number.isFinite(g.baseline))
          return `Enter where “${g.kpi.name}” starts before setting a target.`;
        if (!Number.isFinite(g.target)) return `Target for “${g.kpi.name}” must be a number.`;
        if (g.target === g.baseline)
          return `Target for “${g.kpi.name}” must differ from its starting number.`;
        if (g.target < g.baseline)
          return `Target for “${g.kpi.name}” should be higher than where it starts (${g.baseline}).`;
      }
    }
    return "";
  };
  const next = (skipTo) => {
    const problem = validate();
    if (problem) return setError(problem);
    setError("");
    setStep(skipTo ?? step + 1);
  };
  const back = () => {
    setError("");
    setStep(step === 3 && !used.length ? 1 : step - 1);
  };

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const clientId = uid("client");
      const ops = [
        {
          op: "upsert",
          collection: "clients",
          value: {
            id: clientId,
            ...client,
            name: client.name.trim(),
            startDate,
          },
        },
      ];
      const accountIds = {};
      for (const a of used) {
        const id = uid("account");
        accountIds[a.key] = id;
        ops.push({
          op: "upsert",
          collection: "accounts",
          value: {
            id,
            clientId,
            platform: a.platform,
            handle: a.handle.trim() || a.name.trim() || a.platform,
            name: a.name.trim(),
            kpis: a.kpis
              .filter((k) => k.on)
              .map(({ id: kid, name, unit }) => ({
                id: kid,
                name,
                unit,
                direction: "increase",
              })),
          },
        });
      }
      for (const { account, kpi } of withStart)
        ops.push({
          op: "upsert",
          collection: "metrics",
          value: {
            id: uid("metric"),
            accountId: accountIds[account.key],
            kpiId: kpi.id,
            date: dates[kpi.id] || startDate,
            value: Number(values[kpi.id]),
            ...(periods[kpi.id] && Number(periods[kpi.id]) >= 1
              ? { periodDays: Math.round(Number(periods[kpi.id])) }
              : {}),
            source: "starting numbers",
          },
        });
      if (wantCampaign && used.length) {
        const every = Number(campaign.reviewEveryDays);
        ops.push({
          op: "upsert",
          collection: "campaigns",
          value: {
            id: uid("campaign"),
            clientId,
            name: campaign.name.trim(),
            objective: campaign.objective,
            startDate: campaign.startDate,
            endDate: campaign.endDate,
            status:
              campaign.startDate > today()
                ? "planned"
                : campaign.endDate < today()
                  ? "completed"
                  : "active",
            reviewEveryDays: every,
            nextReviewDate: addDays(today(), every),
            goals: activeGoals.map((g) => ({
              id: uid("goal"),
              accountId: accountIds[g.account.key],
              kpiId: g.kpi.id,
              baseline: g.baseline,
              target: g.target,
              ...(g.periodDays ? { periodDays: g.periodDays } : {}),
            })),
          },
        });
      }
      await onSaveMany(ops);
      onDone?.(clientId);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const noAccounts = !used.length;
  return (
    <Dialog
      wide
      title="Add a new client"
      description="A few quick steps so we know exactly where you are starting and can track every change from here."
      onClose={onClose}
    >
      <ol className="wizard-steps" aria-label="Progress">
        {STEPS.map((label, i) => (
          <li
            key={label}
            className={i === step ? "current" : i < step ? "done" : ""}
            aria-current={i === step ? "step" : undefined}
          >
            <span>{i < step ? <Check size={13} /> : i + 1}</span>
            <em>{label}</em>
          </li>
        ))}
      </ol>

      <div className="wizard-body">
        {step === 0 && (
          <div className="form-grid">
            <Field label="Client or brand name">
              <input
                autoFocus
                value={client.name}
                placeholder="e.g. Maison Lune"
                onChange={(e) => setClient({ ...client, name: e.target.value })}
              />
            </Field>
            <Field label="Industry">
              <input
                value={client.industry}
                placeholder="e.g. Home fragrance"
                onChange={(e) =>
                  setClient({ ...client, industry: e.target.value })
                }
              />
            </Field>
            <Field label="Brand colour">
              <input
                type="color"
                value={client.color}
                onChange={(e) => setClient({ ...client, color: e.target.value })}
              />
            </Field>
            <Field label="Notes about the brand" wide>
              <textarea
                rows={3}
                value={client.notes}
                placeholder="Who they sell to, tone of voice, anything to remember…"
                onChange={(e) => setClient({ ...client, notes: e.target.value })}
              />
            </Field>
          </div>
        )}

        {step === 1 && (
          <>
            <Field
              label="Date you started with this client"
              hint="The starting numbers below are recorded on this date. Everything after it is compared against them."
            >
              <input
                type="date"
                max={today()}
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  if (!campaignDateTouched)
                    setCampaign((c) => ({
                      ...c,
                      startDate: e.target.value,
                      endDate:
                        c.endDate < e.target.value
                          ? addDays(e.target.value, 30)
                          : c.endDate,
                    }));
                }}
              />
            </Field>
            <p className="muted">
              For each platform, add the account, choose the KPIs you want to
              track and enter where they stand on that date. You can edit,
              add or remove KPIs at any time later.
            </p>
            {accounts.map((a) => (
              <div className="wizard-card" key={a.key}>
                <div className="wizard-account-top">
                  <Platform platform={a.platform} size={22} />
                  <Field label="Platform">
                    <select
                      value={a.adding ? ADD_NEW : a.platform}
                      onChange={(e) =>
                        e.target.value === ADD_NEW
                          ? patchAccount(a.key, { adding: true })
                          : patchAccount(a.key, {
                              platform: e.target.value,
                              kpis: kpisFor(e.target.value),
                              adding: false,
                            })
                      }
                    >
                      {platformOptions.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                      <option value={ADD_NEW}>+ Add a new platform…</option>
                    </select>
                    {a.adding && (
                      <div className="chip-add">
                        <input
                          autoFocus
                          aria-label="New platform name"
                          placeholder="e.g. Snapchat, Threads"
                          value={newPlatform[a.key] ?? ""}
                          onChange={(e) =>
                            setNewPlatform({ ...newPlatform, [a.key]: e.target.value })
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              addPlatform(a.key);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn ghost small"
                          disabled={!(newPlatform[a.key] ?? "").trim()}
                          onClick={() => addPlatform(a.key)}
                        >
                          <Plus size={14} /> Add &amp; save
                        </button>
                      </div>
                    )}
                  </Field>
                  <Field label="Name (optional)">
                    <input
                      value={a.name}
                      placeholder="Display name"
                      onChange={(e) => patchAccount(a.key, { name: e.target.value })}
                    />
                  </Field>
                  <Field label="Handle (optional)">
                    <input
                      value={a.handle}
                      placeholder="@yourbrand"
                      onChange={(e) => patchAccount(a.key, { handle: e.target.value })}
                    />
                  </Field>
                  <button
                    type="button"
                    className="icon-btn danger"
                    aria-label="Remove account"
                    disabled={accounts.length === 1}
                    onClick={() =>
                      setAccounts((list) => list.filter((x) => x.key !== a.key))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </div>

                <h3 className="wizard-subtitle">KPIs to track</h3>
                <div className="chip-row">
                  {a.kpis.map((k) => (
                    <button
                      type="button"
                      key={k.id}
                      className={`chip ${k.on ? "on" : ""}`}
                      aria-pressed={k.on}
                      onClick={() => patchKpi(a.key, k.id, { on: !k.on })}
                    >
                      {k.on && <Check size={13} />} {k.name}
                      {k.unit && k.unit !== "%" ? <small> {k.unit}</small> : null}
                    </button>
                  ))}
                </div>
                {library.kpis.some(
                  (k) => !a.kpis.some((x) => x.name.toLowerCase() === k.name.toLowerCase()),
                ) && (
                  <>
                    <p className="muted small">Your saved KPIs</p>
                    <div className="chip-row">
                      {library.kpis
                        .filter(
                          (k) =>
                            !a.kpis.some(
                              (x) => x.name.toLowerCase() === k.name.toLowerCase(),
                            ),
                        )
                        .map((k) => (
                          <span className="chip saved-chip" key={k.name}>
                            <button
                              type="button"
                              className="chip-main"
                              onClick={() => addSaved(a, k)}
                            >
                              <Plus size={13} /> {k.name}
                              {k.unit && k.unit !== "%" ? <small> {k.unit}</small> : null}
                            </button>
                            <button
                              type="button"
                              className="chip-remove"
                              aria-label={`Delete saved KPI ${k.name}`}
                              title="Delete from saved KPIs"
                              onClick={() => setLibrary(removeLibraryKpi(k.name))}
                            >
                              <X size={12} />
                            </button>
                          </span>
                        ))}
                    </div>
                  </>
                )}
                <div className="chip-add">
                  <input
                    aria-label="Custom KPI name"
                    placeholder="Not listed? Type your own KPI, e.g. Link clicks"
                    value={custom[a.key] || ""}
                    onChange={(e) => setCustom({ ...custom, [a.key]: e.target.value })}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addKpi(a);
                      }
                    }}
                  />
                  <select
                    aria-label="Unit"
                    value={customUnit[a.key] || "count"}
                    onChange={(e) =>
                      setCustomUnit({ ...customUnit, [a.key]: e.target.value })
                    }
                  >
                    {UNITS.map((u) => (
                      <option key={u}>{u}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn ghost small"
                    disabled={!(custom[a.key] || "").trim()}
                    onClick={() => addKpi(a)}
                  >
                    <Plus size={14} /> Add &amp; save
                  </button>
                </div>

                {a.kpis.some((k) => k.on) && (
                  <>
                    <h3 className="wizard-subtitle">Where they stand</h3>
                    <div className="wizard-values">
                      {a.kpis
                        .filter((k) => k.on)
                        .map((k) => (
                          <label className="field" key={k.id}>
                            <span>
                              {k.name}
                              {k.unit === "%" ? " (%)" : ""}
                            </span>
                            <NumInput
                              unit={k.unit}
                              placeholder={k.unit === "%" ? "e.g. 3.2" : "Number on that date"}
                              value={values[k.id] ?? ""}
                              onChange={(e) =>
                                setValues({ ...values, [k.id]: e.target.value })
                              }
                            />
                            <input
                              type="date"
                              aria-label={`Date of ${k.name}`}
                              max={today()}
                              value={dates[k.id] || startDate}
                              onChange={(e) =>
                                setDates({ ...dates, [k.id]: e.target.value })
                              }
                            />
                            <PeriodSelect
                              aria-label={`Type of number for ${k.name}`}
                              value={periods[k.id] ?? ""}
                              onChange={(v) => setPeriods({ ...periods, [k.id]: v })}
                            />
                          </label>
                        ))}
                    </div>
                  </>
                )}
              </div>
            ))}
            <button
              type="button"
              className="btn secondary small"
              onClick={() => setAccounts((list) => [
                  ...list,
                  newAccount(
                    platformOptions.find(
                      (p) => !list.some((x) => x.platform === p),
                    ) || platformOptions[0],
                  ),
                ])}
            >
              <Plus size={14} /> Add another platform
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <label className="wizard-toggle">
              <input
                type="checkbox"
                checked={wantCampaign}
                onChange={(e) => setWantCampaign(e.target.checked)}
              />
              <span>
                <strong>Set up a first campaign now</strong>
                <small>
                  A campaign gives the starting numbers a target and a time
                  frame. You can also do this later.
                </small>
              </span>
            </label>
            {wantCampaign && (
              <>
                <div className="form-grid">
                  <Field label="Campaign name">
                    <input
                      value={campaign.name}
                      placeholder="e.g. Spring awareness push"
                      onChange={(e) =>
                        setCampaign({ ...campaign, name: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Assess every (days)">
                    <input
                      type="number"
                      min="1"
                      value={campaign.reviewEveryDays}
                      onChange={(e) =>
                        setCampaign({
                          ...campaign,
                          reviewEveryDays: e.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field label="What should this campaign achieve?" wide>
                    <textarea
                      rows={2}
                      value={campaign.objective}
                      placeholder="e.g. Grow Instagram followers and get more people watching our videos"
                      onChange={(e) =>
                        setCampaign({ ...campaign, objective: e.target.value })
                      }
                    />
                  </Field>
                  <Field label="Starts">
                    <input
                      type="date"
                      value={campaign.startDate}
                      onChange={(e) =>
                        {
                        setCampaignDateTouched(true);
                        setCampaign({ ...campaign, startDate: e.target.value });
                      }
                      }
                    />
                  </Field>
                  <Field label="Ends">
                    <input
                      type="date"
                      min={campaign.startDate}
                      value={campaign.endDate}
                      onChange={(e) =>
                        setCampaign({ ...campaign, endDate: e.target.value })
                      }
                    />
                  </Field>
                </div>
                <h3 className="wizard-subtitle">Targets</h3>
                {goalRows.length ? (
                  <div className="wizard-card">
                    {goalRows.map((g) => (
                      <div className="wizard-goal" key={g.kpi.id}>
                        <div>
                          <strong>
                            {g.kpi.name}
                            {g.periodDays ? ` · ${windowLabel(g.periodDays)}` : ""}
                          </strong>
                          <small className="muted">
                            {g.account.handle || g.account.name || g.account.platform} ({g.account.platform})
                            {g.hasStart
                              ? ` · starts at ${g.baseline}${g.kpi.unit === "%" ? "%" : ""}`
                              : ""}
                          </small>
                        </div>
                        {!g.hasStart && (
                          <NumInput
                            unit={g.kpi.unit}
                            aria-label={`Starting number for ${g.kpi.name}`}
                            placeholder="Starts at…"
                            value={values[g.kpi.id] ?? ""}
                            onChange={(e) =>
                              setValues({ ...values, [g.kpi.id]: e.target.value })
                            }
                          />
                        )}
                        <NumInput
                          unit={g.kpi.unit}
                          aria-label={`Target for ${g.kpi.name}`}
                          placeholder="Target (optional)"
                          value={targets[g.kpi.id] ?? ""}
                          onChange={(e) =>
                            setTargets({ ...targets, [g.kpi.id]: e.target.value })
                          }
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted">
                    Pick KPIs in the previous step to set targets for them.
                  </p>
                )}
              </>
            )}
          </>
        )}

        {step === 3 && (
          <div className="wizard-review">
            <div className="wizard-card">
              <h3 className="wizard-card-title">{client.name}</h3>
              <p className="muted small">{client.industry || "No industry set"}</p>
            </div>
            {used.map((a) => {
              const rows = a.kpis.filter((k) => k.on);
              return (
                <div className="wizard-card" key={a.key}>
                  <h3 className="wizard-card-title">
                    <Platform platform={a.platform} size={16} /> {a.handle || a.name || a.platform}
                  </h3>
                  <ul className="review-list">
                    {rows.map((k) => (
                      <li key={k.id}>
                        <span>{k.name}</span>
                        <strong>
                          {String(values[k.id] ?? "").trim() !== ""
                            ? `${values[k.id]}${k.unit === "%" ? "%" : ""} · ${dates[k.id] || startDate}`
                            : "no starting number"}
                        </strong>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            {noAccounts && (
              <p className="muted">
                No accounts yet. You can add them from Social accounts any time.
              </p>
            )}
            {wantCampaign && !noAccounts && (
              <div className="wizard-card">
                <h3 className="wizard-card-title">{campaign.name}</h3>
                <p className="muted small">
                  {campaign.startDate} to {campaign.endDate} ·{" "}
                  {activeGoals.length} goal
                  {activeGoals.length === 1 ? "" : "s"}
                </p>
              </div>
            )}
            <p className="muted small">
              Each starting number is saved with its own date and appears in charts
              as a data point.
            </p>
          </div>
        )}
      </div>

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}
      <div className="dialog-footer">
        {step === 1 && !used.length && (
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              setError("");
              setStep(3);
            }}
          >
            Skip for now
          </button>
        )}
        {step > 0 && (
          <button type="button" className="btn secondary" onClick={back} disabled={busy}>
            <ArrowLeft size={15} /> Back
          </button>
        )}
        {step < 3 ? (
          <button type="button" className="btn primary" onClick={() => next()}>
            Continue <ArrowRight size={15} />
          </button>
        ) : (
          <button type="button" className="btn primary" onClick={save} disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{" "}
            Save client
          </button>
        )}
      </div>
    </Dialog>
  );
}
