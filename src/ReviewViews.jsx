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
import {
  noticeDetail,
  noticeMeta,
  runNotice,
  whenLabel,
  whenTone,
} from "./Tasks.jsx";

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
  ["different", "What we changed"],
  ["same", "What stayed the same"],
  ["better", "What got better"],
  ["worse", "What got worse"],
];
const ratingLabel = {
  positive: "Went well",
  mixed: "Mixed results",
  negative: "Did not go well",
};

export function ReviewsView({
  state,
  clientId = "all",
  openForm,
  openPost,
  mutate,
  askClaude,
}) {
  const [queueFilter, setQueueFilter] = useState("all");
  const [showCompleted, setShowCompleted] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [typeFilter, setTypeFilter] = useState("all");
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
  const filteredAssessments = assessments.filter(
    (item) => typeFilter === "all" || item.entityType === typeFilter,
  );
  const shownAssessments = showAllHistory
    ? filteredAssessments
    : filteredAssessments.slice(0, 6);
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

  const takeAction = (item) =>
    runNotice(state, item, { openForm, openPost, toggleReminder });

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
          <h1>Assessments & reminders</h1>
          <p>
            Assess campaigns, strategies and posts when they are due, and
            write down what you learned so you know what to try next.
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
            <Plus size={16} /> Write assessment
          </button>
        </div>
      </div>

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}

      <section className="panel">
        <PanelHeader
          title="Due soon"
          description="Assessments that are due, posts waiting to go out, and your reminders for the next 7 days."
          action={
            <button
              className="btn ghost"
              onClick={() =>
                askClaude(
                  `Review the campaign and calendar notifications for ${scopeName(state, clientId)} in this local marketing workspace. Prioritize overdue and due items, explain which metrics need attention, and suggest the next assessment or action using the actual saved data. Distinguish missing evidence from poor results.`,
                )
              }
            >
              <Sparkles size={16} /> Ask Claude what to do first
            </button>
          }
        />
        <div className="filter-chips" aria-label="Filter by when it is due">
          {[
            ["all", "All", queue.length],
            ["overdue", "Overdue", counts.overdue],
            ["due", "Today", counts.due],
            ["upcoming", "Upcoming", counts.upcoming],
          ].map(([value, label, n]) => (
            <button
              key={value}
              className={`${queueFilter === value ? "selected" : ""} ${value === "overdue" && n ? "alert" : ""}`}
              aria-pressed={queueFilter === value}
              onClick={() => setQueueFilter(value)}
            >
              {label} <span>{n}</span>
            </button>
          ))}
        </div>
        {shownQueue.length ? (
          <div className="review-list-rows">
            {shownQueue.map((item) => {
              const context = entityContext(
                state,
                item.entityType,
                item.entityId,
              );
              const meta = noticeMeta(item);
              return (
                <article className={`review-row ${item.severity}`} key={item.id}>
                  <span className="review-row-icon" aria-hidden="true">
                    <meta.Icon size={17} />
                  </span>
                  <div className="review-row-main">
                    <strong>{item.title}</strong>
                    <span className="muted small">
                      {noticeDetail(item, meta)}
                    </span>
                    <span className="muted small">
                      {context.client?.name || "Workspace"}
                      {context.campaign && item.entityType !== "campaign"
                        ? ` · ${context.campaign.name}`
                        : ""}
                    </span>
                  </div>
                  <Badge tone={whenTone(item.date)}>{whenLabel(item.date)}</Badge>
                  <button
                    className="btn secondary small"
                    onClick={() => takeAction(item)}
                    disabled={
                      !context.entity || pending.includes(item.entityId)
                    }
                  >
                    {item.entityType === "reminder" ? (
                      <Check size={15} />
                    ) : (
                      <ArrowRight size={15} />
                    )}
                    {meta.action}
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
                ? "Choose another filter to see the rest."
                : "Nothing is due in the next 7 days. You can still write an assessment at any time."
            }
            action={
              campaign ? (
                <button className="btn secondary" onClick={addAssessment}>
                  <Plus size={16} /> Write an assessment
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
          title="Your reminders"
          description="Get nudged on a date, or when a goal is ahead of or behind where you expected."
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
        <div className="filter-chips" aria-label="Show active or completed reminders">
          <button
            className={!showCompleted ? "selected" : ""}
            aria-pressed={!showCompleted}
            onClick={() => setShowCompleted(false)}
          >
            Active <span>{reminders.filter((item) => !item.done).length}</span>
          </button>
          <button
            className={showCompleted ? "selected" : ""}
            aria-pressed={showCompleted}
            onClick={() => setShowCompleted(true)}
          >
            Completed <span>{reminders.filter((item) => item.done).length}</span>
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
                        ? `When progress is ${item.comparison} ${item.threshold}% of the goal${kpi ? ` · ${kpi.name}` : ""}${item.date ? ` · check from ${niceDate(item.date)}` : ""}`
                        : `On ${niceDate(item.date)}`}
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
                : "No reminders yet"
            }
            description={
              showCompleted
                ? "Reminders you mark done will appear here."
                : "Add a reminder for a date, or for when a goal falls behind or passes a level you choose."
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
          title="Assessment history"
          description="Each written review, newest first. Use the “next test” to decide what to try next."
          action={
            assessments.length ? (
              <button
                className="btn ghost"
                onClick={() =>
                  askClaude(
                    `Read the saved assessments, attributed metrics, strategies, and content results for ${scopeName(state, clientId)}. Summarize what improved or worsened and the variables we changed versus held constant. Identify evidence-backed best-practice hypotheses, state limitations, and suggest one focused follow-up test for each promising pattern. Save findings only with accurate source and confidence labels.`,
                  )
                }
              >
                <Sparkles size={16} /> Find patterns with Claude
              </button>
            ) : null
          }
        />
        {assessments.length > 0 && (
          <div className="filter-chips" aria-label="Filter assessments">
            {[
              ["all", "All"],
              ["campaign", "Campaigns"],
              ["strategy", "Strategies"],
              ["post", "Posts"],
            ].map(([value, label]) => (
              <button
                key={value}
                className={typeFilter === value ? "selected" : ""}
                aria-pressed={typeFilter === value}
                onClick={() => setTypeFilter(value)}
              >
                {label}{" "}
                <span>
                  {value === "all"
                    ? assessments.length
                    : assessments.filter((a) => a.entityType === value).length}
                </span>
              </button>
            ))}
          </div>
        )}
        {shownAssessments.length ? (
          <div className="assessment-list">
            {shownAssessments.map((item) => {
              const context = entityContext(
                state,
                item.entityType,
                item.entityId,
              );
              return (
                <article
                  key={item.id}
                  className={`panel assessment-card ${item.rating}`}
                >
                  <header>
                    <div>
                      <span className="eyebrow">
                        {titleCase(item.entityType)} assessment
                      </span>
                      <h3>{context.label}</h3>
                      <span className="muted small">
                        {niceDate(item.date, {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}{" "}
                        · {context.client?.name || "Workspace"}
                        {context.campaign && item.entityType !== "campaign"
                          ? ` · ${context.campaign.name}`
                          : ""}
                      </span>
                    </div>
                    <Badge tone={ratingTone[item.rating]}>
                      {ratingLabel[item.rating] || titleCase(item.rating)}
                    </Badge>
                  </header>
                  <p className="assessment-summary-text">
                    {item.summary || "No summary written."}
                  </p>
                  <dl className="assessment-fields">
                    {comparisonFields.map(([field, label]) => (
                      <div key={field} className={item[field] ? "" : "blank"}>
                        <dt>{label}</dt>
                        <dd>{item[field] || "Nothing noted"}</dd>
                      </div>
                    ))}
                  </dl>
                  <div className="assessment-next">
                    <FlaskConical size={16} />
                    <div>
                      <strong>Next test or decision</strong>
                      <p>
                        {item.nextTest ||
                          "None recorded yet. Edit this assessment to add one."}
                      </p>
                    </div>
                  </div>
                  <footer>
                    <button
                      className="btn ghost small"
                      onClick={() => openForm("assessment", item)}
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      className="btn ghost small"
                      onClick={() =>
                        askClaude(
                          `Review assessment ${item.id} for "${context.label}" in this local marketing workspace. Read its dated metrics and campaign goals, explain which conclusions the evidence supports and which need testing, then propose one specific next experiment. Do not infer causality from performance alone.`,
                        )
                      }
                    >
                      <Sparkles size={14} /> Ask Claude about this
                    </button>
                  </footer>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="panel">
            <Empty
              icon={ClipboardCheck}
              title={
                assessments.length
                  ? "Nothing in this view"
                  : "No assessments yet"
              }
              description={
                assessments.length
                  ? "Choose another filter above."
                  : "After a campaign, strategy or post has had time to show results, write a short assessment: what changed, what stayed the same, and what to try next."
              }
              action={
                !assessments.length &&
                (campaign ? (
                  <button className="btn primary" onClick={addAssessment}>
                    <Plus size={16} /> Write your first assessment
                  </button>
                ) : (
                  <button
                    className="btn secondary"
                    onClick={() => openForm("campaign")}
                  >
                    <Plus size={16} /> Create a campaign
                  </button>
                ))
              }
            />
          </div>
        )}
        {filteredAssessments.length > 6 && (
          <button
            className="btn secondary"
            style={{ marginTop: 16 }}
            onClick={() => setShowAllHistory((value) => !value)}
          >
            {showAllHistory
              ? "Show fewer"
              : `Show all ${filteredAssessments.length} assessments`}
          </button>
        )}
      </section>
    </div>
  );
}

export function PracticesView({
  state,
  clientId = "all",
  openForm,
  askClaude,
  onTestIdea,
}) {
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

  const testPractice = (practice) => onTestIdea(practice);

  return (
    <div className="practices-view" style={{ display: "grid", gap: 24 }}>
      <div className="page-heading">
        <div>
          <h1>Best practices</h1>
          <p>
            What you have learned about what works, with the evidence behind
            it. Use “Test this idea” to turn one into an experiment and plan
            its first post.
          </p>
        </div>
        <button
          className="btn primary"
          onClick={() =>
            openForm("practice", null, clientId !== "all" ? { clientId } : {})
          }
        >
          <Plus size={16} /> Add a learning
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
          <div className="eyebrow">NOT SURE WHAT WORKED?</div>
          <h2 style={{ margin: "10px 0" }}>
            Have Claude look for patterns in your results.
          </h2>
          <p className="muted" style={{ margin: 0 }}>
            Claude reads your saved results and assessments, suggests why some
            things performed better, and proposes one test to confirm it.
          </p>
        </div>
        <button
          className="btn secondary"
          onClick={() =>
            askClaude(
              `Analyze the best-performing strategies and executed content for ${scopeName(state, clientId)} using the saved campaign goals, attributed metrics, and assessment history in this folder. Compare reporting windows and baselines before ranking. Explain plausible reasons for performance, separate association from causation, and identify alternative explanations. Suggest focused tests that change one variable at a time. Save useful best-practice hypotheses with dated evidence, source "codex", appropriate confidence, and the next test. Exclude demo claims from real-world conclusions.`,
            )
          }
        >
          <Sparkles size={16} /> Ask Claude to analyze
        </button>
      </section>

      <div className="filter-chips" aria-label="Filter learnings by how sure you are">
        {[
          ["all", "All"],
          ["hypothesis", "Just an idea"],
          ["emerging", "Looking likely"],
          ["validated", "Proven"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={confidence === value ? "selected" : ""}
            aria-pressed={confidence === value}
            onClick={() => setConfidence(value)}
          >
            {label}{" "}
            <span>
              {value === "all"
                ? scopedPractices.length
                : scopedPractices.filter((item) => item.confidence === value)
                    .length}
            </span>
          </button>
        ))}
      </div>

      {demos > 0 && (
        <div className="notice">
          <BookOpen size={18} />
          <span>
            Some of these are examples that show how to write a learning down.
            They are not based on your own results.
          </span>
        </div>
      )}

      {practices.length ? (
        <div className="cards-grid fluid">
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
                      ? "Written by Claude"
                      : item.source === "demo"
                        ? "Example"
                        : "Added by you"}
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
                    <div className="eyebrow">WHAT WE SAW</div>
                    <p
                      style={{
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        margin: "7px 0 0",
                      }}
                    >
                      {item.evidence ||
                        "Nothing written yet. Add the numbers or posts that back this up."}
                    </p>
                  </div>
                  <div>
                    <div className="eyebrow">WHY IT MAY HAVE WORKED</div>
                    <p
                      className="muted"
                      style={{
                        whiteSpace: "pre-wrap",
                        lineHeight: 1.6,
                        margin: "7px 0 0",
                      }}
                    >
                      {item.explanation ||
                        "Nothing written yet. Add your best guess for why this worked."}
                    </p>
                  </div>
                  <div className="notice" style={{ display: "block" }}>
                    <strong
                      style={{ display: "flex", gap: 7, alignItems: "center" }}
                    >
                      <FlaskConical size={16} /> What to test next
                    </strong>
                    <p style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>
                      {item.nextTest ||
                        "Nothing written yet. Describe one small change to try."}
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
                        ? "Create a campaign first, so the test has somewhere to live."
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
                      askClaude(
                        `Review the saved best practice ${item.id}, "${item.title}", in this marketing workspace. Check its evidence against actual attributed metrics and assessments, explain what the data can and cannot support, and propose a follow-up experiment that isolates one plausible cause. This practice is labeled ${item.source} with ${item.confidence} confidence; preserve its provenance and do not treat demo data as real campaign results.`,
                      )
                    }
                  >
                    <Sparkles size={14} /> Ask Claude
                  </button>
                </div>
                {!campaigns.length && (
                  <p className="muted small" style={{ marginBottom: 0 }}>
                    Create a campaign first so you can test this idea.
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
                : "No learnings saved yet"
            }
            description={
              scopedPractices.length
                ? "Choose a different filter, or add a new learning."
                : "When something works, write it down here with the numbers behind it and one test to confirm it."
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
                <Plus size={16} /> Add a learning
              </button>
            }
          />
        </section>
      )}
    </div>
  );
}
