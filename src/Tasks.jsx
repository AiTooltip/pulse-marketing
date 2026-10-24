import React, { useState } from "react";
import {
  Bell,
  CalendarClock,
  Check,
  ClipboardCheck,
  FlaskConical,
  ListChecks,
  Plus,
  Repeat,
  Tags,
  Trash2,
} from "lucide-react";
import { Badge, Empty, PanelHeader, niceDate, uid } from "./components.jsx";
import { notifications, today, addDays } from "../shared/domain.mjs";

export const TASK_KINDS = {
  todo: { label: "To do", title: "" },
  assess: { label: "Assess", title: "Assess results" },
  strategy: { label: "Add strategy", title: "Add a strategy" },
  tactics: { label: "Add tactics", title: "Add tactics" },
  "weekly-analysis": {
    label: "Weekly analysis",
    title: "Weekly analysis",
    repeat: "weekly",
    days: 7,
  },
  "monthly-analysis": {
    label: "Monthly analysis",
    title: "Monthly analysis",
    repeat: "monthly",
    days: 30,
  },
};

const addMonth = (date) => {
  const [y, m, d] = date.split("-").map(Number);
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return new Date(Date.UTC(y, m, Math.min(d, last), 12))
    .toISOString()
    .slice(0, 10);
};

/** Next due date of a repeating task, never in the past. */
const nextDue = (task) => {
  const step = task.repeat === "monthly" ? addMonth : (d) => addDays(d, 7);
  let next = step(task.dueDate || today());
  while (next <= today()) next = step(next);
  return next;
};

const severity = (date) =>
  !date ? "none" : date < today() ? "overdue" : date === today() ? "due" : "upcoming";
const TONE = { overdue: "red", due: "amber", upcoming: "neutral", none: "neutral" };

/** "Overdue · Oct 3", "Today", "Oct 8". */
export const whenLabel = (date) => {
  const s = severity(date);
  if (s === "overdue") return `Overdue · ${niceDate(date)}`;
  if (s === "due") return "Today";
  return date ? niceDate(date) : "";
};
export const whenTone = (date) => TONE[severity(date)];

/** Which client an auto-generated reminder belongs to, so the client filter applies. */
export function reminderClientId(state, item) {
  const find = (c, id) => (state[c] || []).find((x) => x.id === id);
  let campaign;
  if (item.entityType === "campaign") campaign = find("campaigns", item.entityId);
  if (item.entityType === "strategy") {
    const s = find("strategies", item.entityId);
    campaign = find("campaigns", s?.campaignId);
  }
  if (item.entityType === "post") {
    const p = find("posts", item.entityId);
    return find("accounts", p?.accountId)?.clientId;
  }
  if (item.entityType === "reminder") {
    const r = find("reminders", item.entityId);
    campaign = find("campaigns", r?.campaignId);
  }
  return campaign?.clientId;
}

/** What a scheduled item is and the one thing to do about it. */
export function noticeMeta(item) {
  const prefix = item.id.split(":")[0];
  if (item.entityType === "reminder")
    return { type: "Reminder", action: "Mark done", Icon: Bell };
  if (item.kind === "details")
    return { type: "Strategy", action: "Add details", Icon: FlaskConical };
  if (item.kind === "tactics")
    return { type: "Post", action: "Add tactics", Icon: Tags };
  if (item.kind === "strategy")
    return { type: "Post", action: "Add strategy", Icon: FlaskConical };
  if (prefix === "publish")
    return { type: "Publish", action: "Open post", Icon: CalendarClock };
  if (item.entityType === "campaign")
    return { type: "Campaign review", action: "Assess", Icon: ClipboardCheck };
  if (item.entityType === "strategy")
    return { type: "Strategy review", action: "Assess", Icon: ClipboardCheck };
  return { type: "Post review", action: "Assess", Icon: ClipboardCheck };
}

/** "Publish · Reel · content ready", without repeating the type. */
export const noticeDetail = (item, meta = noticeMeta(item)) =>
  item.detail.startsWith(meta.type) ? item.detail : `${meta.type} · ${item.detail}`;

/** Do the item's action. Shared by the Overview list and the Assessments page. */
export function runNotice(state, item, { openForm, openPost, toggleReminder }) {
  const collection = {
    campaign: "campaigns",
    strategy: "strategies",
    post: "posts",
    reminder: "reminders",
  }[item.entityType];
  const entity = (state[collection] || []).find((x) => x.id === item.entityId);
  if (!entity) return;
  const prefix = item.id.split(":")[0];
  if (item.entityType === "reminder") toggleReminder(entity);
  else if (item.kind === "details") openForm("strategy", entity);
  else if (item.kind === "tactics" || item.kind === "strategy")
    openForm("post", entity);
  else if (prefix === "publish") openPost(entity);
  else
    openForm("assessment", null, {
      entityType: item.entityType,
      entityId: item.entityId,
    });
}

const INITIAL_ROWS = 6;

export default function TasksPanel({
  state,
  clientId,
  mutateMany,
  navigate,
  openForm,
  openPost,
  notify,
}) {
  const inScope = (cid) => clientId === "all" || !cid || cid === clientId;
  const [kind, setKind] = useState("todo");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [owner, setOwner] = useState("");
  const [showDone, setShowDone] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const clientName = (id) => state.clients.find((c) => c.id === id)?.name;
  const chosenClient =
    owner || (clientId !== "all" ? clientId : state.clients[0]?.id) || "";
  const preset = TASK_KINDS[kind];

  const tasks = (state.tasks || []).filter((t) => inScope(t.clientId));
  const open = tasks.filter((t) => !t.done);
  const done = tasks
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt || "").localeCompare(a.completedAt || ""));
  const auto = notifications(state)
    .filter((n) => inScope(reminderClientId(state, n)))
    .filter((n) => n.date <= addDays(today(), 7));

  // One list in date order: your own tasks and scheduled items side by side.
  // Tasks without a date count as "any time today", so they stay in view.
  const sortKey = (r) => r.date || `${today()}~`;
  const rows = [
    ...auto.map((item) => ({ auto: true, item, date: item.date })),
    ...open.map((task) => ({ auto: false, task, date: task.dueDate })),
  ].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const urgent = rows.filter((r) => sortKey(r) <= `${today()}~`).length;
  const limit = Math.max(INITIAL_ROWS, urgent);
  const visible = expanded ? rows : rows.slice(0, limit);

  const pickKind = (value) => {
    setKind(value);
    const p = TASK_KINDS[value];
    if (p.days && !due) setDue(addDays(today(), p.days));
  };

  async function save(key, operations, message) {
    setBusy(key);
    setError("");
    try {
      await mutateMany(operations, undefined, message);
      return true;
    } catch (failure) {
      setError(failure.message || "Unable to save this task.");
      return false;
    } finally {
      setBusy("");
    }
  }

  async function add(e) {
    e.preventDefault();
    const text = title.trim() || preset.title;
    if (!text || busy) return;
    const saved = await save(
      "new",
      [
        {
          op: "upsert",
          collection: "tasks",
          value: {
            id: uid("task"),
            title: text,
            kind,
            done: false,
            ...(chosenClient ? { clientId: chosenClient } : {}),
            ...(due ? { dueDate: due } : {}),
            ...(preset.repeat ? { repeat: preset.repeat } : {}),
            createdAt: new Date().toISOString(),
          },
        },
      ],
      "Task added",
    );
    if (saved) {
      setTitle("");
      setDue("");
      setKind("todo");
    }
  }

  async function toggle(task) {
    if (busy) return;
    const finishing = !task.done;
    const next = { ...task, done: finishing };
    if (finishing) next.completedAt = today();
    else delete next.completedAt;
    const operations = [{ op: "upsert", collection: "tasks", value: next }];
    // A repeating task (weekly/monthly analysis) schedules its next round.
    if (finishing && task.repeat)
      operations.push({
        op: "upsert",
        collection: "tasks",
        value: {
          id: uid("task"),
          title: task.title,
          kind: task.kind,
          done: false,
          repeat: task.repeat,
          dueDate: nextDue(task),
          ...(task.clientId ? { clientId: task.clientId } : {}),
          createdAt: new Date().toISOString(),
        },
      });
    await save(
      task.id,
      operations,
      finishing
        ? task.repeat
          ? `Done. The next one is due ${niceDate(nextDue(task))}`
          : "Task done"
        : "Task reopened",
    );
  }

  async function remove(task) {
    if (busy) return;
    const ok = await save(
      task.id,
      [{ op: "delete", collection: "tasks", id: task.id }],
      "Task deleted",
    );
    // Deleting is one click, so offer a way back.
    if (ok && notify)
      notify(`Deleted “${task.title}”`, "success", {
        label: "Undo",
        run: () =>
          save(
            task.id,
            [{ op: "upsert", collection: "tasks", value: task }],
            "Task restored",
          ),
      });
  }

  const toggleReminder = (reminder) =>
    save(
      reminder.id,
      [
        {
          op: "upsert",
          collection: "reminders",
          value: { ...reminder, done: !reminder.done },
        },
      ],
      "Reminder marked done",
    );

  const openReminder = (item) => {
    const find = (c) => state[c].find((x) => x.id === item.entityId);
    if (item.entityType === "strategy") openForm("strategy", find("strategies"));
    else if (item.entityType === "post") openPost(find("posts"));
    else navigate("reviews");
  };

  const count = rows.length;
  return (
    <section className="panel tasks-panel" aria-labelledby="tasks-title">
      <PanelHeader
        title={
          <span id="tasks-title">
            Needs attention <span className="task-count">{count}</span>
          </span>
        }
        description="Overdue and due items first, then the next 7 days. Your own tasks have a checkbox."
        action={
          <button
            className="text-btn"
            onClick={() => navigate("reviews")}
            aria-label="See all assessments and reminders"
          >
            See all
          </button>
        }
      />
      {state.clients.length === 0 ? (
        <p className="muted">Add a client to start adding tasks.</p>
      ) : (
        <form className="task-form" onSubmit={add} aria-label="Add a task">
          <input
            aria-label="New task"
            className="task-title-input"
            placeholder={
              preset.title ? `${preset.title} (optional title)` : "Add a task…"
            }
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <select
            aria-label="Task type"
            value={kind}
            onChange={(e) => pickKind(e.target.value)}
          >
            {Object.entries(TASK_KINDS).map(([value, k]) => (
              <option key={value} value={value}>
                {k.label}
              </option>
            ))}
          </select>
          {state.clients.length > 1 && (
            <select
              aria-label="Client"
              value={chosenClient}
              onChange={(e) => setOwner(e.target.value)}
            >
              {state.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <input
            type="date"
            aria-label="Due date (optional)"
            title="Due date (optional)"
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
          <button
            className="btn primary small"
            disabled={busy === "new" || (!title.trim() && !preset.title)}
          >
            <Plus size={15} /> Add
          </button>
        </form>
      )}
      {preset.repeat && (
        <p className="muted task-hint">
          <Repeat size={12} /> Repeats {preset.repeat}: finishing it schedules the
          next one.
        </p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <ul className="task-list">
        {visible.map((row) => {
          if (row.auto) {
            const { item } = row;
            const meta = noticeMeta(item);
            return (
              <li key={item.id} className={`task-row auto ${item.severity}`}>
                <span className="task-check auto-icon" aria-hidden="true">
                  <meta.Icon size={14} />
                </span>
                <button
                  className="task-main task-open"
                  onClick={() => openReminder(item)}
                >
                  <strong>{item.title}</strong>
                  <span>
                    {noticeDetail(item, meta)}
                  </span>
                </button>
                <span className="task-badges">
                  <Badge tone={whenTone(item.date)}>{whenLabel(item.date)}</Badge>
                </span>
                <button
                  className="btn secondary small task-action"
                  disabled={busy === item.entityId}
                  onClick={() =>
                    runNotice(state, item, {
                      openForm,
                      openPost,
                      toggleReminder,
                    })
                  }
                >
                  {item.entityType === "reminder" && <Check size={14} />}
                  {meta.action}
                </button>
              </li>
            );
          }
          const t = row.task;
          return (
            <li key={t.id} className={`task-row ${severity(t.dueDate)}`}>
              <button
                className="task-check"
                aria-label={`Mark “${t.title}” done`}
                title="Mark done"
                disabled={busy === t.id}
                onClick={() => toggle(t)}
              />
              <span className="task-main">
                <strong>{t.title}</strong>
                <span>
                  {t.kind !== "todo" ? `${TASK_KINDS[t.kind]?.label} · ` : "Task · "}
                  {clientName(t.clientId) || "No client"}
                  {t.repeat && (
                    <>
                      {" · "}
                      <Repeat size={11} aria-hidden="true" /> {t.repeat}
                    </>
                  )}
                </span>
              </span>
              <span className="task-badges">
                {t.dueDate && (
                  <Badge tone={whenTone(t.dueDate)}>{whenLabel(t.dueDate)}</Badge>
                )}
              </span>
              <button
                className="icon-btn task-delete"
                aria-label={`Delete “${t.title}”`}
                title="Delete task"
                disabled={busy === t.id}
                onClick={() => remove(t)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          );
        })}
      </ul>
      {!count && (
        <Empty
          icon={ListChecks}
          title="You’re all caught up"
          description="Nothing is due in the next 7 days. Add a task above, or a weekly or monthly analysis that repeats on its own."
        />
      )}
      <div className="task-footer">
        {rows.length > limit && (
          <button
            className="text-btn"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? "Show fewer"
              : `Show ${rows.length - limit} more in the next 7 days`}
          </button>
        )}
        {done.length > 0 && (
          <button
            className="text-btn task-done-toggle"
            aria-expanded={showDone}
            onClick={() => setShowDone((v) => !v)}
          >
            {showDone ? "Hide" : "Show"} completed tasks ({done.length})
          </button>
        )}
      </div>
      {showDone && done.length > 0 && (
        <ul className="task-list">
          {done.slice(0, 20).map((t) => (
            <li key={t.id} className="task-row done">
              <button
                className="task-check checked"
                aria-label={`Mark “${t.title}” not done`}
                title="Mark not done"
                disabled={busy === t.id}
                onClick={() => toggle(t)}
              >
                <Check size={12} />
              </button>
              <span className="task-main">
                <strong>{t.title}</strong>
                <span>
                  {clientName(t.clientId) || "No client"}
                  {t.completedAt && ` · done ${niceDate(t.completedAt)}`}
                </span>
              </span>
              <button
                className="icon-btn task-delete"
                aria-label={`Delete “${t.title}”`}
                title="Delete task"
                disabled={busy === t.id}
                onClick={() => remove(t)}
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
