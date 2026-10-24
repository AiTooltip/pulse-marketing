import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { today, addDays } from "../shared/domain.mjs";

export class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
export const collections = [
  "clients",
  "accounts",
  "campaigns",
  "strategies",
  "tactics",
  "theories",
  "posts",
  "metrics",
  "assessments",
  "reminders",
  "tasks",
  "competitors",
  "benchmarks",
  "intel",
  "practices",
];
const TASK_KINDS = [
  "todo",
  "assess",
  "strategy",
  "tactics",
  "weekly-analysis",
  "monthly-analysis",
];
const allCollections =[...collections, "activity"];
export const emptyState = () => ({
  schemaVersion: 1,
  revision: "",
  settings: { workspaceName: "Marketing Control Center", postReviewDays: 7 },
  ...Object.fromEntries(allCollections.map((k) => [k, []])),
});
const fail = (message) => {
  throw new AppError(400, message);
};
const object = (v, label) => {
  if (!v || typeof v !== "object" || Array.isArray(v))
    fail(`${label} must be an object.`);
};
const str = (v, label, required = true) => {
  if (v === undefined && !required) return;
  if (typeof v !== "string" || v.length > 20000 || (required && !v.trim()))
    fail(`${label} must be ${required ? "a non-empty" : "a"} string.`);
};
const num = (v, label) => {
  if (typeof v !== "number" || !Number.isFinite(v))
    fail(`${label} must be a finite number.`);
};
const interval = (v, label) => {
  if (!Number.isInteger(v) || v < 1 || v > 3650)
    fail(`${label} must be an integer from 1 to 3650.`);
};
const oneOf = (v, values, label) => {
  if (!values.includes(v))
    fail(`${label} must be one of: ${values.join(", ")}.`);
};
export const validDate = (v) =>
  typeof v === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(`${v}T12:00:00Z`)) &&
  new Date(`${v}T12:00:00Z`).toISOString().slice(0, 10) === v;
const date = (v, label, required = true) => {
  if (v === undefined && !required) return;
  if (!validDate(v)) fail(`${label} must be a valid YYYY-MM-DD date.`);
};
const optionalText = (v, keys, label) =>
  keys.forEach((k) => str(v[k], `${label}.${k}`, false));
const id = (v, label) => {
  if (typeof v !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/.test(v))
    fail(
      `${label} must be a short ID containing letters, digits, dots, dashes, underscores or colons.`,
    );
};

export function validateState(s) {
  object(s, "State");
  if (s.schemaVersion !== 1) fail("Unsupported schemaVersion. Expected 1.");
  // Workspaces saved before tactics existed simply have none.
  if (s.tactics === undefined) s.tactics = [];
  if (s.theories === undefined) s.theories = [];
  if (s.tasks === undefined) s.tasks = [];
  for (const k of ["competitors", "benchmarks", "intel"])
    if (s[k] === undefined) s[k] = [];
  object(s.settings, "settings");
  str(s.settings.workspaceName, "settings.workspaceName");
  interval(s.settings.postReviewDays, "settings.postReviewDays");
  const ids = new Set();
  for (const key of allCollections) {
    if (!Array.isArray(s[key]) || s[key].length > 100000)
      fail(`${key} must be an array of at most 100000 records.`);
    for (const v of s[key]) {
      object(v, key);
      id(v.id, `${key}.id`);
      if (ids.has(v.id)) fail(`Duplicate record ID: ${v.id}.`);
      ids.add(v.id);
      optionalText(v, ["createdAt", "updatedAt"], key);
    }
  }
  const lookup = Object.fromEntries(
    allCollections.map((k) => [k, new Map(s[k].map((v) => [v.id, v]))]),
  );
  const ref = (collection, value, label) => {
    id(value, label);
    const result = lookup[collection].get(value);
    if (!result) fail(`${label} refers to a missing ${collection} record.`);
    return result;
  };
  for (const c of s.clients) {
    str(c.name, "Client name");
    optionalText(c, ["industry", "color", "notes"], "Client");
    date(c.startDate, "Client start date", false);
  }
  for (const a of s.accounts) {
    ref("clients", a.clientId, "Account client");
    str(a.platform, "Account platform");
    str(a.handle, "Account handle", false);
    str(a.name, "Account name", false);
    if (!Array.isArray(a.kpis) || a.kpis.length > 100)
      fail("Account KPIs must be an array of at most 100 entries.");
    const seen = new Set();
    for (const k of a.kpis) {
      object(k, "KPI");
      id(k.id, "KPI ID");
      if (seen.has(k.id)) fail("Duplicate KPI ID on account.");
      seen.add(k.id);
      str(k.name, "KPI name");
      str(k.unit, "KPI unit", false);
      oneOf(k.direction, ["increase", "decrease"], "KPI direction");
    }
  }
  const accountKpi = (accountId, kpiId) => {
    const a = ref("accounts", accountId, "Metric/goal account");
    if (!a.kpis.some((k) => k.id === kpiId))
      fail("Metric/goal KPI does not belong to its account.");
    return a;
  };
  for (const c of s.campaigns) {
    ref("clients", c.clientId, "Campaign client");
    str(c.name, "Campaign name");
    optionalText(c, ["objective"], "Campaign");
    date(c.startDate, "Campaign start");
    date(c.endDate, "Campaign end");
    if (c.endDate < c.startDate)
      fail("Campaign end date cannot precede start date.");
    oneOf(
      c.status,
      ["active", "planned", "completed", "paused"],
      "Campaign status",
    );
    interval(c.reviewEveryDays, "Campaign review interval");
    date(c.nextReviewDate, "Campaign next review");
    if (!Array.isArray(c.goals)) fail("Campaign goals must be an array.");
    const goalIds = new Set(),
      dimensions = new Set();
    for (const g of c.goals) {
      object(g, "Goal");
      id(g.id, "Goal ID");
      if (goalIds.has(g.id)) fail("Duplicate goal ID in campaign.");
      goalIds.add(g.id);
      const a = accountKpi(g.accountId, g.kpiId);
      if (a.clientId !== c.clientId)
        fail(
          "Campaign goals must use accounts belonging to the campaign client.",
        );
      if (g.periodDays !== undefined)
        interval(g.periodDays, "Goal period (days)");
      const dim = `${g.accountId}:${g.kpiId}:${g.periodDays || 0}`;
      if (dimensions.has(dim))
        fail(
          "Campaign has duplicate goals for the same account, KPI and period.",
        );
      dimensions.add(dim);
      num(g.baseline, "Goal baseline");
      num(g.target, "Goal target");
      if (g.target === g.baseline)
        fail("Goal target must differ from its baseline.");
      const k = a.kpis.find((k) => k.id === g.kpiId);
      if (
        k.direction === "increase"
          ? g.target < g.baseline
          : g.target > g.baseline
      )
        fail("Goal target must follow the KPI improvement direction.");
    }
  }
  for (const st of s.strategies) {
    ref("campaigns", st.campaignId, "Strategy campaign");
    str(st.name, "Strategy name");
    optionalText(st, ["hypothesis", "changes", "keep"], "Strategy");
    oneOf(
      st.status,
      ["testing", "promising", "adopted", "paused"],
      "Strategy status",
    );
    interval(st.reviewEveryDays, "Strategy review interval");
    date(st.nextReviewDate, "Strategy next review");
  }
  for (const t of s.tactics) {
    str(t.name, "Tactic name");
    if (t.name.length > 200) fail("Tactic name is too long.");
    optionalText(t, ["description", "category"], "Tactic");
    if (t.status !== undefined)
      oneOf(
        t.status,
        ["idea", "testing", "promising", "proven", "adopted", "paused"],
        "Tactic status",
      );
  }
  for (const th of s.theories) {
    ref("tactics", th.tacticId, "Theory tactic");
    const acc = ref("accounts", th.accountId, "Theory account");
    if (!acc.kpis.some((k) => k.id === th.kpiId))
      fail("Theory KPI does not belong to its account.");
    if (th.periodDays !== undefined) interval(th.periodDays, "Theory period (days)");
    str(th.statement, "Theory statement");
    date(th.startedAt, "Theory start date");
    oneOf(th.status, ["testing", "proven", "disproven", "paused"], "Theory status");
    date(th.decidedAt, "Theory decided date", false);
    optionalText(th, ["note"], "Theory");
  }
  for (const p of s.posts) {
    if (p.tacticsLater !== undefined && typeof p.tacticsLater !== "boolean")
      fail("Post tacticsLater must be true or false.");
    if (p.strategyLater !== undefined && typeof p.strategyLater !== "boolean")
      fail("Post strategyLater must be true or false.");
    if (p.tacticIds !== undefined) {
      if (!Array.isArray(p.tacticIds) || p.tacticIds.length > 60)
        fail("Post tactics must be a list of at most 60 tactic IDs.");
      if (new Set(p.tacticIds).size !== p.tacticIds.length)
        fail("Post lists the same tactic twice.");
      for (const tid of p.tacticIds) ref("tactics", tid, "Post tactic");
    }
    // A post does not have to belong to a campaign.
    const a = ref("accounts", p.accountId, "Post account");
    const c = p.campaignId ? ref("campaigns", p.campaignId, "Post campaign") : null;
    if (c && c.clientId !== a.clientId)
      fail("Post account must belong to its campaign client.");
    if (p.strategyId) {
      const st = ref("strategies", p.strategyId, "Post strategy");
      if (c ? st.campaignId !== c.id : lookup.campaigns.get(st.campaignId)?.clientId !== a.clientId)
        fail(
          c
            ? "Post strategy must belong to its campaign."
            : "Post strategy must belong to the same client as the post's account.",
        );
    }
    str(p.title, "Post title");
    oneOf(
      p.format,
      ["Reel", "Video", "Post", "Carousel", "Story", "Article"],
      "Post format",
    );
    date(p.date, "Post date");
    oneOf(p.status, ["planned", "executed", "cancelled"], "Post status");
    oneOf(p.readiness, ["needed", "in-progress", "ready"], "Post readiness");
    optionalText(p, ["notes", "url"], "Post");
    date(p.executedAt, "Post executed date", false);
    if (p.status === "executed" && !p.executedAt)
      fail("Executed post needs executedAt.");
    if (p.reviewAfterDays !== undefined)
      interval(p.reviewAfterDays, "Post review interval");
    if (p.url && !/^https?:\/\//i.test(p.url))
      fail("Post URL must start with http:// or https://.");
  }
  for (const m of s.metrics) {
    const a = accountKpi(m.accountId, m.kpiId);
    date(m.date, "Metric date");
    num(m.value, "Metric value");
    if (m.periodDays !== undefined)
      interval(m.periodDays, "Metric period (days)");
    optionalText(m, ["source"], "Metric");
    let c = m.campaignId
      ? ref("campaigns", m.campaignId, "Metric campaign")
      : null;
    const st = m.strategyId
      ? ref("strategies", m.strategyId, "Metric strategy")
      : null;
    const p = m.postId ? ref("posts", m.postId, "Metric post") : null;
    if (st) {
      if (c && st.campaignId !== c.id)
        fail("Metric strategy and campaign disagree.");
      c ||= lookup.campaigns.get(st.campaignId);
    }
    if (p) {
      if (c && p.campaignId !== c.id)
        fail("Metric post and campaign disagree.");
      if (st && p.strategyId !== st.id)
        fail("Metric post and strategy disagree.");
      if (p.accountId !== a.id) fail("Metric post and account disagree.");
      c ||= lookup.campaigns.get(p.campaignId);
    }
    if (c && a.clientId !== c.clientId)
      fail("Metric account and campaign must belong to the same client.");
  }
  for (const a of s.assessments) {
    oneOf(
      a.entityType,
      ["campaign", "strategy", "post"],
      "Assessment entity type",
    );
    ref(
      `${a.entityType === "strategy" ? "strategie" : a.entityType}s`,
      a.entityId,
      "Assessment entity",
    );
    date(a.date, "Assessment date");
    str(a.summary, "Assessment summary");
    optionalText(
      a,
      ["different", "same", "better", "worse", "nextTest"],
      "Assessment",
    );
    oneOf(a.rating, ["positive", "mixed", "negative"], "Assessment rating");
  }
  for (const r of s.reminders) {
    str(r.title, "Reminder title");
    oneOf(r.type, ["date", "progress"], "Reminder type");
    if (typeof r.done !== "boolean") fail("Reminder done must be boolean.");
    date(r.date, "Reminder date", r.type === "date");
    const c = r.campaignId
      ? ref("campaigns", r.campaignId, "Reminder campaign")
      : null;
    if (r.type === "progress") {
      if (!c || !c.goals.some((g) => g.id === r.goalId))
        fail("Progress reminder must reference a goal in its campaign.");
      num(r.threshold, "Reminder threshold");
      oneOf(r.comparison, ["below", "above"], "Reminder comparison");
    }
  }
  for (const t of s.tasks) {
    str(t.title, "Task title");
    str(t.notes, "Task notes", false);
    oneOf(t.kind, TASK_KINDS, "Task kind");
    if (typeof t.done !== "boolean") fail("Task done must be boolean.");
    if (t.clientId) ref("clients", t.clientId, "Task client");
    date(t.dueDate, "Task due date", false);
    date(t.completedAt, "Task completed date", false);
    if (t.repeat !== undefined) oneOf(t.repeat, ["weekly", "monthly"], "Task repeat");
  }
  for (const c of s.competitors) {
    ref("clients", c.clientId, "Competitor client");
    str(c.name, "Competitor name");
    oneOf(c.tier, ["direct", "indirect", "aspirational"], "Competitor tier");
    oneOf(c.threat, ["high", "medium", "low"], "Competitor threat level");
    optionalText(
      c,
      ["website", "positioning", "audience", "offer", "strengths", "weaknesses", "notes"],
      "Competitor",
    );
    if (!Array.isArray(c.channels) || c.channels.length > 30)
      fail("Competitor channels must be a list of at most 30 entries.");
    for (const ch of c.channels) {
      object(ch, "Competitor channel");
      str(ch.platform, "Competitor channel platform");
      str(ch.handle, "Competitor channel handle", false);
    }
  }
  for (const b of s.benchmarks) {
    const c = ref("competitors", b.competitorId, "Benchmark competitor");
    void c;
    str(b.platform, "Benchmark platform");
    date(b.date, "Benchmark date");
    const given = ["followers", "postsPerWeek", "engagementRate", "avgViews"].filter(
      (k) => b[k] !== undefined,
    );
    if (!given.length) fail("A benchmark needs at least one number.");
    for (const k of given) {
      num(b[k], `Benchmark ${k}`);
      if (b[k] < 0) fail(`Benchmark ${k} cannot be negative.`);
    }
    if (b.engagementRate !== undefined && b.engagementRate > 100)
      fail("Benchmark engagementRate is a percentage from 0 to 100.");
    optionalText(b, ["source"], "Benchmark");
  }
  for (const i of s.intel) {
    const client = ref("clients", i.clientId, "Intel client");
    if (i.competitorId) {
      const c = ref("competitors", i.competitorId, "Intel competitor");
      if (c.clientId !== client.id)
        fail("Intel competitor must belong to the same client.");
    }
    date(i.date, "Intel date");
    oneOf(
      i.category,
      ["content", "messaging", "campaign", "product", "pricing", "other"],
      "Intel category",
    );
    str(i.observation, "Intel observation");
    optionalText(i, ["implication", "source"], "Intel");
  }
  for (const p of s.practices) {
    const client = p.clientId
      ? ref("clients", p.clientId, "Practice client")
      : null;
    const st = p.strategyId
      ? ref("strategies", p.strategyId, "Practice strategy")
      : null;
    if (
      client &&
      st &&
      lookup.campaigns.get(st.campaignId).clientId !== client.id
    )
      fail("Practice strategy must belong to its client.");
    if (p.tacticId) ref("tactics", p.tacticId, "Practice tactic");
    str(p.title, "Practice title");
    optionalText(p, ["evidence", "explanation", "nextTest"], "Practice");
    oneOf(
      p.confidence,
      ["hypothesis", "emerging", "validated"],
      "Practice confidence",
    );
    oneOf(p.source, ["manual", "codex", "demo"], "Practice source");
  }
  for (const a of s.activity) {
    str(a.at, "Activity timestamp");
    str(a.description, "Activity description");
  }
  return s;
}

function revision(state) {
  const { revision: ignored, ...data } = state;
  return createHash("sha256")
    .update(JSON.stringify(data))
    .digest("hex")
    .slice(0, 24);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function createStore(dataFile) {
  dataFile = path.resolve(dataFile);
  let queue = Promise.resolve();
  const read = async () => {
    await fs.mkdir(path.dirname(dataFile), { recursive: true });
    let raw;
    try {
      raw = await fs.readFile(dataFile, "utf8");
    } catch (e) {
      if (e.code !== "ENOENT")
        throw new AppError(
          503,
          "Workspace could not be read. Check local folder permissions.",
        );
      const state = emptyState();
      state.revision = revision(state);
      try {
        await fs.writeFile(dataFile, JSON.stringify(state, null, 2) + "\n", {
          flag: "wx",
        });
      } catch (e) {
        if (e.code !== "EEXIST") throw e;
      }
      raw = await fs.readFile(dataFile, "utf8");
    }
    try {
      const state = validateState(JSON.parse(raw));
      state.revision = revision(state);
      return state;
    } catch {
      throw new AppError(
        503,
        "The workspace JSON is invalid or uses an unsupported schema. Your file was preserved. Restore a backup or fix the file before continuing.",
      );
    }
  };
  const transaction = (expected, update, description) => {
    const run = queue.then(async () => {
      await fs.mkdir(path.dirname(dataFile), { recursive: true });
      const lockFile = `${dataFile}.lock`;
      let lock;
      for (let attempts = 0; attempts < 40; attempts++) {
        try {
          lock = await fs.open(lockFile, "wx", 0o600);
          await lock.writeFile(
            JSON.stringify({ pid: process.pid, at: Date.now() }),
          );
          break;
        } catch (e) {
          if (e.code !== "EEXIST") throw e;
          await sleep(50);
        }
      }
      if (!lock)
        throw new AppError(
          409,
          "Workspace is busy. If a previous process crashed, remove workspace.json.lock after confirming no server is writing.",
        );
      let temporary;
      try {
        const current = await read();
        if (typeof expected !== "string" || expected !== current.revision)
          throw new AppError(
            409,
            "The workspace changed. Reload the latest state and retry your edit.",
          );
        const next = structuredClone(current);
        const result = await update(next);
        next.activity.push({
          id: `activity-${randomUUID()}`,
          at: new Date().toISOString(),
          description,
        });
        next.activity = next.activity.slice(-500);
        validateState(next);
        next.revision = revision(next);
        const backupDir = path.join(path.dirname(dataFile), "backups");
        await fs.mkdir(backupDir, { recursive: true });
        const backupName = `${Date.now()}-${randomUUID()}.json`;
        await fs.copyFile(dataFile, path.join(backupDir, backupName));
        temporary = path.join(
          path.dirname(dataFile),
          `.workspace-${randomUUID()}.tmp`,
        );
        const handle = await fs.open(temporary, "wx", 0o600);
        try {
          await handle.writeFile(JSON.stringify(next, null, 2) + "\n");
          await handle.sync();
        } finally {
          await handle.close();
        }
        // A Codex/file edit made during this operation must not silently disappear.
        if ((await read()).revision !== current.revision)
          throw new AppError(
            409,
            "The workspace changed during this edit. Reload and retry.",
          );
        await fs.rename(temporary, dataFile);
        temporary = null;
        const backups = (await fs.readdir(backupDir))
          .filter((n) => /^\d+-[\da-f-]+\.json$/.test(n))
          .sort();
        await Promise.all(
          backups
            .slice(0, Math.max(0, backups.length - 30))
            .map((n) => fs.unlink(path.join(backupDir, n)).catch(() => {})),
        );
        return { state: next, ...result };
      } finally {
        if (temporary) await fs.unlink(temporary).catch(() => {});
        await lock.close();
        await fs.unlink(lockFile).catch(() => {});
      }
    });
    queue = run.catch(() => {});
    return run;
  };
  const mutate = (expected, operations) =>
    transaction(
      expected,
      (state) => {
        if (
          !Array.isArray(operations) ||
          operations.length < 1 ||
          operations.length > 1000
        )
          fail("Provide between 1 and 1000 operations.");
        for (const op of operations) {
          object(op, "Operation");
          if (!collections.includes(op.collection))
            fail("Unsupported collection.");
          if (op.op === "delete") {
            id(op.id, "Delete ID");
            const at = state[op.collection].findIndex((v) => v.id === op.id);
            if (at < 0) fail("Record to delete was not found.");
            state[op.collection].splice(at, 1);
          } else if (op.op === "upsert") {
            object(op.value, "Upsert value");
            id(op.value.id, "Upsert ID");
            const value = structuredClone(op.value);
            const at = state[op.collection].findIndex((v) => v.id === value.id);
            if (
              op.collection === "posts" &&
              value.status === "executed" &&
              !value.executedAt
            )
              value.executedAt = today();
            if (
              op.collection === "assessments" &&
              at < 0 &&
              ["campaign", "strategy"].includes(value.entityType)
            ) {
              const entity = state[
                value.entityType === "campaign" ? "campaigns" : "strategies"
              ].find((v) => v.id === value.entityId);
              if (entity && validDate(value.date)) {
                const latest = state.assessments
                  .filter(
                    (a) =>
                      a.entityType === value.entityType &&
                      a.entityId === value.entityId,
                  )
                  .reduce((d, a) => (a.date > d ? a.date : d), value.date);
                entity.nextReviewDate = addDays(latest, entity.reviewEveryDays);
              }
            }
            if (at < 0) state[op.collection].push(value);
            else state[op.collection][at] = value;
          } else fail("Unsupported operation.");
        }
      },
      `${operations?.length ?? 0} workspace edit(s)`,
    );
  const importMetrics = (expected, rows, filename) =>
    transaction(
      expected,
      (state) => {
        const key = (m) =>
          JSON.stringify([
            m.accountId,
            m.kpiId,
            m.date,
            m.value,
            m.campaignId || "",
            m.strategyId || "",
            m.postId || "",
            m.periodDays || 0,
          ]);
        const seen = new Set(state.metrics.map(key));
        let imported = 0,
          skipped = 0;
        for (const m of rows) {
          if (seen.has(key(m))) {
            skipped++;
            continue;
          }
          seen.add(key(m));
          state.metrics.push({
            ...m,
            id: `metric-${randomUUID()}`,
            source: filename,
          });
          imported++;
        }
        return { imported, skipped };
      },
      `Imported metrics from ${path.basename(filename || "file")}`,
    );
  return { read, mutate, importMetrics };
}
