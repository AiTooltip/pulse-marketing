import { useState } from "react";
import {
  ArrowRight,
  Bell,
  BookOpen,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  FlaskConical,
  Pencil,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  Badge,
  Empty,
  PanelHeader,
  niceDate,
  titleCase,
} from "./components.jsx";
import { notifications } from "../shared/domain.mjs";

function entityContext(state, type, id) {
  const collection = {
    campaign: "campaigns",
    strategy: "strategies",
    post: "posts",
    reminder: "reminders",
  }[type];
  const entity = (state[collection] || []).find((item) => item.id === id);
  const campaign =
    type === "campaign"
      ? entity
      : state.campaigns.find((item) => item.id === entity?.campaignId);
  const account =
    type === "post"
      ? state.accounts.find((item) => item.id === entity?.accountId)
      : null;
  const client = state.clients.find(
    (item) => item.id === (campaign?.clientId || account?.clientId),
  );
  return {
    entity,
    campaign,
    client,
    label: entity?.name || entity?.title || "Archived item",
  };
}

function inScope(context, clientId) {
  return (
    clientId === "all" || !context.client || context.client.id === clientId
  );
}

function scopeName(state, clientId) {
  return (
    state.clients.find((item) => item.id === clientId)?.name || "this workspace"
  );
}

const severityTone = { overdue: "red", due: "amber", upcoming: "neutral" };
const ratingTone = { positive: "green", mixed: "amber", negative: "red" };
const confidenceTone = {
  hypothesis: "neutral",
  emerging: "amber",
  validated: "green",
};
const comparisonFields = [
  ["different", "What changed"],
  ["same", "What stayed the same"],
  ["better", "What worked better"],
  ["worse", "What worked worse"],
];

export function ReviewsView({
  state,
  clientId = "all",
  openForm,
  mutate,
  askCodex,
}) {
  const [queueFilter, setQueueFilter] = useState("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [pending, setPending] = useState([]);
  const [error, setError] = useState("");
  const queue = notifications(state).filter((item) =>
    inScope(entityContext(state, item.entityType, item.entityId), clientId),
  );
  const shownQueue = queue.filter(
    (item) => queueFilter === "all" || item.severity === queueFilter,
  );
  const reminders = state.reminders.filter((item) =>
    inScope(entityContext(state, "reminder", item.id), clientId),
  );
  const shownReminders = reminders
    .filter((item) => Boolean(item.done) === showCompleted)
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  const assessments = state.assessments
    .filter((item) =>
      inScope(entityContext(state, item.entityType, item.entityId), clientId),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  const shownAssessments = showAllHistory
    ? assessments
    : assessments.slice(0, 6);
  const campaign = state.campaigns.find(
    (item) => clientId === "all" || item.clientId === clientId,
  );
  const counts = {
    overdue: queue.filter((item) => item.severity === "overdue").length,
    due: queue.filter((item) => item.severity === "due").length,
    upcoming: queue.filter((item) => item.severity === "upcoming").length,
  };

  async function toggleReminder(reminder) {
    if (pending.includes(reminder.id)) return;
    setPending((items) => [...items, reminder.id]);
    setError("");
    try {
      await mutate("reminders", { ...reminder, done: !reminder.done });
    } catch (failure) {
      setError(failure.message || "Unable to update this reminder.");
    } finally {
      setPending((items) => items.filter((id) => id !== reminder.id));
    }
  }

  function takeAction(item) {
    const { entity } = entityContext(state, item.entityType, item.entityId);
    if (!entity) return;
    if (item.entityType === "reminder") {
      toggleReminder(entity);
    } else if (item.entityType === "post" && entity.status === "planned") {
      openForm("post", entity);
    } else {
      openForm("assessment", null, {
        entityType: item.entityType,
        entityId: item.entityId,
      });
    }
  }

  function addAssessment() {
    openForm(
      "assessment",
      null,
      campaign ? { entityType: "campaign", entityId: campaign.id } : {},
    );
  }

  return (
    <div className="reviews-view" style={{ display: "grid", gap: 24 }}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">REFLECT. REFINE. REPEAT.</div>
          <h1>Reviews & reminders</h1>
          <p>
            Keep every campaign moving. Capture what changed, what worked, and
            what to try next.
          </p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn secondary"
            onClick={() =>
              openForm(
                "reminder",
                null,
                campaign ? { campaignId: campaign.id } : {},
              )
            }
          >
            <Bell size={16} /> Set reminder
          </button>
          <button
            className="btn primary"
            onClick={addAssessment}
            disabled={!campaign}
          >
            <Plus size={16} /> Log assessment
          </button>
        </div>
      </div>

      <div
        className="stat-strip"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
          gap: 16,
        }}
      >
        <div>
          <span className="muted">Overdue</span>
          <strong style={{ display: "block" }}>{counts.overdue}</strong>
          <span className="muted">Need a check-in</span>
        </div>
        <div>
          <span className="muted">Due today</span>
          <strong style={{ display: "block" }}>{counts.due}</strong>
          <span className="muted">On your radar</span>
        </div>
        <div>
          <span className="muted">Next 7 days</span>
          <strong style={{ display: "block" }}>{counts.upcoming}</strong>
          <span className="muted">Coming up</span>
        </div>
        <div>
          <span className="muted">Assessments logged</span>
          <strong style={{ display: "block" }}>{assessments.length}</strong>
          <span className="muted">Decisions with context</span>
        </div>
      </div>

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      <section className="panel">
        <PanelHeader
          eyebrow="YOUR NEXT MOVES"
          title="Review queue"
          description="Campaign and strategy check-ins, content follow-ups, and reminders."
          action={
            <button
              className="btn ghost"
              onClick={() =>
                askCodex(
                  `Review the campaign and calendar notifications for ${scopeName(state, clientId)} in this local marketing workspace. Prioritize overdue and due items, explain which metrics need attention, and suggest the next assessment or action using the actual saved data. Distinguish missing evidence from poor results.`,
                )
              }
            >
              <Sparkles size={16} /> Prioritize with Codex
            </button>
          }
        />
        <div
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginBottom: 20,
          }}
          aria-label="Filter review queue"
        >
          {[
            ["all", `All (${queue.length})`],
            ["overdue", `Overdue (${counts.overdue})`],
            ["due", `Today (${counts.due})`],
            ["upcoming", `Upcoming (${counts.upcoming})`],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`btn ${queueFilter === value ? "secondary" : "ghost"} small`}
              aria-pressed={queueFilter === value}
              onClick={() => setQueueFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {shownQueue.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {shownQueue.map((item) => {
              const context = entityContext(
                state,
                item.entityType,
                item.entityId,
              );
              const isPlanned =
                item.entityType === "post" &&
                context.entity?.status === "planned";
              const isReminder = item.entityType === "reminder";
              return (
                <article
                  className={`review-card ${item.severity}`}
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 16,
                    flexWrap: "wrap",
                  }}
                >
                  <span aria-hidden="true">
                    {isReminder ? (
                      <Bell size={20} />
                    ) : isPlanned ? (
                      <CalendarClock size={20} />
                    ) : (
                      <ClipboardCheck size={20} />
                    )}
                  </span>
                  <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        alignItems: "center",
                        flexWrap: "wrap",
                      }}
                    >
                      <strong>{item.title}</strong>
                      <Badge tone={severityTone[item.severity]}>
                        {item.severity === "due"
                          ? "Today"
                          : titleCase(item.severity)}
                      </Badge>
                    </div>
                    <p className="muted" style={{ margin: "6px 0" }}>
                      {item.detail}
                    </p>
                    <span className="muted small">
                      {context.client?.name || "Workspace"} ·{" "}
                      {niceDate(item.date)}
                      {context.campaign && item.entityType !== "campaign"
                        ? ` · ${context.campaign.name}`
                        : ""}
                    </span>
                  </div>
                  <button
                    className="btn secondary small"
                    onClick={() => takeAction(item)}
                    disabled={
                      !context.entity || pending.includes(item.entityId)
                    }
                  >
                    {isReminder ? (
                      <Check size={15} />
                    ) : (
                      <ArrowRight size={15} />
                    )}
                    {isReminder
                      ? "Mark done"
                      : isPlanned
                        ? "Review plan"
                        : "Assess results"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            icon={CheckCircle2}
            title={
              queue.length ? "Nothing in this view" : "You’re all caught up"
            }
            description={
              queue.length
                ? "Choose another filter to see your other scheduled check-ins."
                : "New reviews appear here on their scheduled dates, with a seven-day look ahead. You can log an assessment whenever useful."
            }
            action={
              campaign ? (
                <button className="btn secondary" onClick={addAssessment}>
                  <Plus size={16} /> Log an assessment
                </button>
              ) : (
                <button
                  className="btn secondary"
                  onClick={() => openForm("campaign")}
                >
                  <Plus size={16} /> Create a campaign
                </button>
              )
            }
          />
        )}
      </section>

      <section className="panel">
        <PanelHeader
          eyebrow="STAY AHEAD"
          title="Your reminders"
          description="Date and progress triggers you can adjust at any time."
          action={
            <button
              className="btn ghost"
              onClick={() =>
                openForm(
                  "reminder",
                  null,
                  campaign ? { campaignId: campaign.id } : {},
                )
              }
            >
              <Plus size={16} /> New reminder
            </button>
          }
        />
        <div style={{ display: "flex", gap: 6, marginBottom: 18 }}>
          <button
            className={`btn ${!showCompleted ? "secondary" : "ghost"} small`}
            aria-pressed={!showCompleted}
            onClick={() => setShowCompleted(false)}
          >
            Active ({reminders.filter((item) => !item.done).length})
          </button>
          <button
            className={`btn ${showCompleted ? "secondary" : "ghost"} small`}
            aria-pressed={showCompleted}
            onClick={() => setShowCompleted(true)}
          >
            Completed ({reminders.filter((item) => item.done).length})
          </button>
        </div>
        {shownReminders.length ? (
          <div style={{ display: "grid", gap: 12 }}>
            {shownReminders.map((item) => {
              const context = entityContext(state, "reminder", item.id);
              const goal = context.campaign?.goals.find(
                (entry) => entry.id === item.goalId,
              );
              const account = state.accounts.find(
                (entry) => entry.id === goal?.accountId,
              );
              const kpi = account?.kpis.find(
                (entry) => entry.id === goal?.kpiId,
              );
              return (
                <article
                  className="review-card"
                  key={item.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: "1 1 250px" }}>
                    <strong>{item.title}</strong>
                    <p className="muted" style={{ margin: "6px 0" }}>
                      {item.type === "progress"
                        ? `${titleCase(item.comparison)} ${item.threshold}% of goal progress${kpi ? ` · ${kpi.name}` : ""}${item.date ? ` · check from ${niceDate(item.date)}` : ""}`
                        : `Scheduled for ${niceDate(item.date)}`}
                    </p>
                    <span className="muted small">
                      {context.client?.name || "Workspace"}
                      {context.campaign ? ` · ${context.campaign.name}` : ""}
                    </span>
                  </div>
                  <button
                    className="btn ghost small"
                    onClick={() => openForm("reminder", item)}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    className="btn secondary small"
                    onClick={() => toggleReminder(item)}
                    disabled={pending.includes(item.id)}
                  >
                    {item.done ? <RotateCcw size={14} /> : <Check size={14} />}
                    {item.done ? "Reopen" : "Mark done"}
                  </button>
                </article>
              );
            })}
          </div>
        ) : (
          <Empty
            icon={Bell}
            title={
              showCompleted
                ? "No completed reminders yet"
                : "Make room for the right check-ins"
            }
            description={
              showCompleted
                ? "Reminders you mark done will appear here."
                : "Set a date or a campaign goal threshold so you know when to take a closer look."
            }
            action={
              !showCompleted ? (
                <button
                  className="btn secondary"
                  onClick={() =>
                    openForm(
                      "reminder",
                      null,
                      campaign ? { campaignId: campaign.id } : {},
                    )
                  }
                >
                  <Plus size={16} /> Set a reminder
                </button>
              ) : null
            }
          />
        )}
      </section>

      <section>
        <PanelHeader
          eyebrow="THE LEARNING LOOP"
          title="Assessment history"
          description="Your notes become the starting point for the next experiment."
          action={
            assessments.length ? (
              <button
                className="btn ghost"
                onClick={() =>
                  askCodex(
                    `Read the saved assessments, attributed metrics, strategies, and content results for ${scopeName(state, clientId)}. Summarize what improved or worsened and the variables we changed versus held constant. Identify evidence-backed best-practice hypotheses, state limitations, and suggest one focused follow-up test for each promising pattern. Save findings only with accurate source and confidence labels.`,
                  )
                }
              >
                <Sparkles size={16} /> Find patterns with Codex
              </button>
            ) : null
          }
        />
        {shownAssessments.length ? (
          <div className="cards-grid">
            {shownAssessments.map((item) => {
              const context = entityContext(
                state,
                item.entityType,
                item.entityId,
              );
              const populated = comparisonFields.filter(
                ([field]) => item[field],
              );
              return (
                <article key={item.id} className="panel review-card">
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      marginBottom: 14,
                    }}
                  >
                    <span className="eyebrow">
                      {titleCase(item.entityType)} assessment
                    </span>
                    <Badge tone={ratingTone[item.rating]}>
                      {titleCase(item.rating)}
                    </Badge>
                  </div>
                  <h3 style={{ margin: "0 0 8px" }}>{context.label}</h3>
                  <div className="muted small">
                    {niceDate(item.date, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}{" "}
                    · {context.client?.name || "Workspace"}
                  </div>
                  <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                    {item.summary || "No summary recorded."}
                  </p>
                  {populated.length > 0 && (
                    <div className="assessment-grid">
                      {populated.map(([field, label]) => (
                        <div key={field}>
                          <span className="eyebrow">{label}</span>
                          <p style={{ whiteSpace: "pre-wrap" }}>
                            {item[field]}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                  {item.nextTest && (
                    <div
                      className="notice"
                      style={{ display: "block", marginTop: 16 }}
                    >
                      <strong
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 7,
                        }}
                      >
                        <FlaskConical size={16} /> Next test / decision
                      </strong>
                      <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>
                        {item.nextTest}
                      </p>
                    </div>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      flexWrap: "wrap",
                      marginTop: 18,
                    }}
                  >
                    <button
                      className="btn ghost small"
                      onClick={() => openForm("assessment", item)}
                    >
                      <Pencil size={14} /> Edit assessment
                    </button>
                    <button
                      className="btn ghost small"
                      onClick={() =>
                        askCodex(
                          `Review assessment ${item.id} for "${context.label}" in this local marketing workspace. Read its dated metrics and campaign goals, explain which conclusions the evidence supports and which need testing, then propose one specific next experiment. Do not infer causality from performance alone.`,
                        )
                      }
                    >
                      <Sparkles size={14} /> Explore with Codex
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel">
            <Empty
              icon={ClipboardCheck}
              title="Every result has something to teach"
              description="Log a campaign, strategy, or content assessment. Note what changed, what stayed the same, and what you want to test next."
              action={
                campaign ? (
                  <button className="btn primary" onClick={addAssessment}>
                    <Plus size={16} /> Log your first assessment
                  </button>
                ) : (
                  <button
                    className="btn secondary"
                    onClick={() => openForm("campaign")}
                  >
                    <Plus size={16} /> Create a campaign
                  </button>
                )
              }
            />
          </div>
        )}
        {assessments.length > 6 && (
          <button
            className="btn secondary"
            style={{ marginTop: 16 }}
            onClick={() => setShowAllHistory((value) => !value)}
          >
            {showAllHistory
              ? "Show recent assessments"
              : `View all ${assessments.length} assessments`}
          </button>
        )}
      </section>
    </div>
  );
}

export function PracticesView({ state, clientId = "all", openForm, askCodex }) {
  const [confidence, setConfidence] = useState("all");
  const scopedPractices = state.practices.filter((item) => {
    const source = item.strategyId
      ? entityContext(state, "strategy", item.strategyId)
      : null;
    const ownerId = item.clientId || source?.client?.id;
    return clientId === "all" || !ownerId || ownerId === clientId;
  });
  const practices = scopedPractices.filter(
    (item) => confidence === "all" || item.confidence === confidence,
  );
  const campaigns = state.campaigns.filter(
    (item) => clientId === "all" || item.clientId === clientId,
  );
  const demos = scopedPractices.filter((item) => item.source === "demo").length;

  function testPractice(practice) {
    const sourceStrategy = state.strategies.find(
      (item) => item.id === practice.strategyId,
    );
    const campaign =
      campaigns.find((item) => item.id === sourceStrategy?.campaignId) ||
      campaigns.find(
        (item) => !practice.clientId || item.clientId === practice.clientId,
      ) ||
      campaigns[0];
    openForm("strategy", null, {
      name: practice.title,
      hypothesis: practice.explanation || "",
      changes: practice.nextTest || "",
      campaignId: campaign?.id || "",
    });
  }

  return (
    <div className="practices-view" style={{ display: "grid", gap: 24 }}>
      <div className="page-heading">
        <div>
          <div className="eyebrow">BUILD ON WHAT WORKS</div>
          <h1>Best practices</h1>
          <p>
            A living library of evidence, useful hypotheses, and ideas worth
            testing again.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            openForm("practice", null, clientId !== "all" ? { clientId } : {})
          }
        >
          <Plus size={16} /> Add practice
        </button>
      </div>

      <section
        className="panel"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 22,
        }}
      >
        <div style={{ flex: "1 1 400px" }}>
          <div className="eyebrow">FROM PERFORMANCE TO A NEW TEST</div>
          <h2 style={{ margin: "10px 0" }}>
            Find the reason behind the result.
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Ask Codex to review your strongest strategies, compare what changed,
            and suggest a focused experiment. Saved insights keep their evidence
            and confidence attached.
          </p>
        </div>
        <button
          className="btn secondary"
          onClick={() =>
            askCodex(
              `Analyze the best-performing strategies and executed content for ${scopeName(state, clientId)} using the saved campaign goals, attributed metrics, and assessment history in this folder. Compare reporting windows and baselines before ranking. Explain plausible reasons for performance, separate association from causation, and identify alternative explanations. Suggest focused tests that change one variable at a time. Save useful best-practice hypotheses with dated evidence, source "codex", appropriate confidence, and the next test. Exclude demo claims from real-world conclusions.`,
            )
          }
        >
          <Sparkles size={16} /> Analyze with Codex
        </button>
      </section>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: 12,
        }}
      >
        <div
          style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          aria-label="Filter practices by confidence"
        >
          {[
            ["all", "All practices"],
            ["hypothesis", "Hypotheses"],
            ["emerging", "Emerging"],
            ["validated", "Validated"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={`btn ${confidence === value ? "secondary" : "ghost"} small`}
              aria-pressed={confidence === value}
              onClick={() => setConfidence(value)}
            >
              {label}{" "}
              <span className="muted">
                {value === "all"
                  ? scopedPractices.length
                  : scopedPractices.filter((item) => item.confidence === value)
                      .length}
              </span>
            </button>
          ))}
        </div>
        <span className="muted small">
          {scopedPractices.length} saved learning
          {scopedPractices.length === 1 ? "" : "s"}
        </span>
      </div>

      {demos > 0 && (
        <div className="notice">
          <BookOpen size={18} />
          <span>
            Demo practices illustrate how to document a learning. They are
            sample notes, not analysis of your own results.
          </span>
        </div>
      )}

      {practices.length ? (
        <div className="cards-grid">
          {practices.map((item) => {
            const sourceStrategy = state.strategies.find(
              (entry) => entry.id === item.strategyId,
            );
            const context = sourceStrategy
              ? entityContext(state, "strategy", sourceStrategy.id)
              : null;
            const client =
              state.clients.find((entry) => entry.id === item.clientId) ||
              context?.client;
            return (
              <article className="panel practice-card" key={item.id}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 18,
                  }}
                >
                  <Badge tone={confidenceTone[item.confidence]}>
                    {titleCase(item.confidence)}
                  </Badge>
                  <span
                    className="muted small"
                    style={{ display: "flex", gap: 5, alignItems: "center" }}
                  >
                    {item.source === "codex" ? (
                      <Sparkles size={13} />
                    ) : item.source === "demo" ? (
                      <BookOpen size={13} />
                    ) : (
                      <Pencil size={13} />
                    )}
                    {item.source === "codex"
                      ? "Codex analysis"
                      : item.source === "demo"
                        ? "Demo example"
                        : "Manual insight"}
                  </span>
                </div>
                <h3 style={{ margin: "0 0 8px", fontSize: 20 }}>
                  {item.title}
                </h3>
                <p className="muted small" style={{ margin: "0 0 24px" }}>
                  {client?.name || "Shared across the workspace"}
                  {sourceStrategy ? ` · ${sourceStrategy.name}` : ""}
                </p>
                <div style={{ display: "grid", gap: 18 }}>
                  <div>
                    <div className="eyebrow">THE EVIDENCE</div>
                    <p
                      style={{
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        margin: "7px 0 0",
                      }}
                    >
                      {item.evidence ||
                        "No evidence added yet. Link the observations that support this idea."}
                    </p>
                  </div>
                  <div>
                    <div className="eyebrow">POSSIBLE EXPLANATION</div>
                    <p
                      className="muted"
                      style={{
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        margin: "7px 0 0",
                      }}
                    >
                      {item.explanation ||
                        "Capture why you think this worked, including other possible explanations."}
                    </p>
                  </div>
                  <div className="notice" style={{ display: "block" }}>
                    <strong
                      style={{ display: "flex", gap: 7, alignItems: "center" }}
                    >
                      <FlaskConical size={16} /> Test it again
                    </strong>
                    <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>
                      {item.nextTest ||
                        "Define a focused next test before treating this as a repeatable practice."}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    flexWrap: "wrap",
                    marginTop: 24,
                  }}
                >
                  <button
                    className="btn secondary small"
                    disabled={!campaigns.length}
                    title={
                      !campaigns.length
                        ? "Create a campaign before adding a strategy."
                        : undefined
                    }
                    onClick={() => testPractice(item)}
                  >
                    <FlaskConical size={15} /> Test this idea
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => openForm("practice", item)}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() =>
                      askCodex(
                        `Review the saved best practice ${item.id}, "${item.title}", in this marketing workspace. Check its evidence against actual attributed metrics and assessments, explain what the data can and cannot support, and propose a follow-up experiment that isolates one plausible cause. This practice is labeled ${item.source} with ${item.confidence} confidence; preserve its provenance and do not treat demo data as real campaign results.`,
                      )
                    }
                  >
                    <Sparkles size={14} /> Ask Codex
                  </button>
                </div>
                {!campaigns.length && (
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    Create a campaign to turn this idea into a strategy.
                  </p>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <section className="panel">
          <Empty
            icon={FlaskConical}
            title={
              scopedPractices.length
                ? "No practices at this confidence level"
                : "Your next breakthrough starts with a note"
            }
            description={
              scopedPractices.length
                ? "Try another filter or add a learning with supporting evidence."
                : "Save a promising result, its possible explanation, and one test that could help you understand why it worked."
            }
            action={
              <button
                className="btn primary"
                onClick={() =>
                  openForm(
                    "practice",
                    null,
                    clientId !== "all" ? { clientId } : {},
                  )
                }
              >
                <Plus size={16} /> Add a practice
              </button>
            }
          />
        </section>
      )}
    </div>
  );
}
