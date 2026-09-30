import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import http from "node:http";
import ExcelJS from "exceljs";
import { startServer } from "../server/index.mjs";
import { emptyState, validateState } from "../server/store.mjs";
import { today, addDays } from "../shared/domain.mjs";

function fixture() {
  const s = emptyState();
  s.clients.push({ id: "client", name: "Demo" });
  s.accounts.push({
    id: "account",
    clientId: "client",
    name: "Instagram",
    platform: "Instagram",
    handle: "@demo",
    kpis: [
      { id: "reach", name: "Reach", unit: "people", direction: "increase" },
    ],
  });
  s.campaigns.push({
    id: "campaign",
    clientId: "client",
    name: "Launch",
    objective: "",
    startDate: addDays(today(), -30),
    endDate: addDays(today(), 30),
    status: "active",
    reviewEveryDays: 30,
    nextReviewDate: today(),
    goals: [
      {
        id: "goal",
        accountId: "account",
        kpiId: "reach",
        baseline: 100,
        target: 200,
      },
    ],
  });
  s.strategies.push({
    id: "strategy",
    campaignId: "campaign",
    name: "Hooks",
    status: "testing",
    reviewEveryDays: 7,
    nextReviewDate: today(),
  });
  return s;
}

async function setup(t) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "marketing-test-"));
  const dataFile = path.join(dir, "data", "workspace.json"),
    distDir = path.join(dir, "dist");
  await fs.mkdir(path.dirname(dataFile));
  await fs.mkdir(distDir);
  await fs.writeFile(dataFile, JSON.stringify(fixture()));
  await fs.writeFile(
    path.join(distDir, "index.html"),
    "<!doctype html><title>Test app</title>",
  );
  const server = await startServer({ port: 0, dataFile, distDir });
  t.after(async () => {
    await server.close();
    await fs.rm(dir, { recursive: true, force: true });
  });
  const request = async (endpoint, data, headers = {}) => {
    const r = await fetch(
      server.url + endpoint,
      data === undefined
        ? { headers }
        : {
            method: "POST",
            headers: { "Content-Type": "application/json", ...headers },
            body: JSON.stringify(data),
          },
    );
    const result = await r.json();
    return { status: r.status, result };
  };
  return {
    ...server,
    dir,
    dataFile,
    request,
    state: () => request("/api/state").then((r) => r.result),
  };
}
const upsert = (collection, value) => ({ op: "upsert", collection, value });

test("concurrent writes have one winner and external Codex edits invalidate revisions", async (t) => {
  const app = await setup(t),
    state = await app.state();
  const results = await Promise.all(
    ["First", "Second"].map((name) =>
      app.request("/api/mutate", {
        revision: state.revision,
        operations: [upsert("clients", { id: "client", name })],
      }),
    ),
  );
  assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  const current = await app.state();
  const direct = JSON.parse(await fs.readFile(app.dataFile, "utf8"));
  direct.clients[0].name = "Edited in Codex";
  await fs.writeFile(app.dataFile, JSON.stringify(direct));
  const stale = await app.request("/api/mutate", {
    revision: current.revision,
    operations: [upsert("clients", { id: "client", name: "Overwrite" })],
  });
  assert.equal(stale.status, 409);
  assert.equal((await app.state()).clients[0].name, "Edited in Codex");
  assert.ok(
    (await fs.readdir(path.join(app.dir, "data", "backups"))).length >= 1,
  );
});

test("invalid references or cross-client dimensions reject the whole transaction", async (t) => {
  const app = await setup(t),
    state = await app.state();
  const result = await app.request("/api/mutate", {
    revision: state.revision,
    operations: [
      upsert("clients", { id: "client", name: "Must roll back" }),
      { op: "delete", collection: "accounts", id: "account" },
    ],
  });
  assert.equal(result.status, 400);
  assert.equal((await app.state()).clients[0].name, "Demo");
  const wrong = fixture();
  wrong.clients.push({ id: "second", name: "Another client" });
  wrong.accounts[0].clientId = "second";
  assert.throws(() => validateState(wrong), /campaign client/);
  const invalidDate = fixture();
  invalidDate.campaigns[0].startDate = "2026-02-30";
  assert.throws(() => validateState(invalidDate), /valid YYYY-MM-DD/);
  const nonFinite = fixture();
  nonFinite.campaigns[0].goals[0].target = Infinity;
  assert.throws(() => validateState(nonFinite), /finite number/);
});

test("executing content and adding assessments persist automatic review dates", async (t) => {
  const app = await setup(t),
    state = await app.state();
  const post = {
    id: "post",
    campaignId: "campaign",
    accountId: "account",
    strategyId: "strategy",
    title: "A short hook",
    format: "Reel",
    date: today(),
    status: "executed",
    readiness: "ready",
  };
  let r = await app.request("/api/mutate", {
    revision: state.revision,
    operations: [upsert("posts", post)],
  });
  assert.equal(r.status, 200);
  assert.equal(r.result.posts[0].executedAt, today());
  r = await app.request("/api/mutate", {
    revision: r.result.revision,
    operations: [
      upsert("assessments", {
        id: "assessment",
        entityType: "strategy",
        entityId: "strategy",
        date: today(),
        summary: "Promising",
        rating: "positive",
      }),
    ],
  });
  assert.equal(r.status, 200);
  assert.equal(r.result.strategies[0].nextReviewDate, addDays(today(), 7));
});

test("CSV preview, mapping and deduplication are atomic; ambiguous dates do not partially import", async (t) => {
  const app = await setup(t),
    state = await app.state();
  const base = {
    filename: "metrics.csv",
    content: Buffer.from(
      `Day,Reach\n${today()},150\n${today()},150\n`,
    ).toString("base64"),
  };
  const preview = await app.request("/api/import/preview", base);
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.result.columns, ["Day", "Reach"]);
  assert.equal(preview.result.totalRows, 2);
  const input = {
    ...base,
    revision: state.revision,
    mapping: { date: "Day", value: "Reach" },
    accountId: "account",
    kpiId: "reach",
    campaignId: "campaign",
  };
  const committed = await app.request("/api/import/commit", input);
  assert.equal(committed.status, 200);
  assert.equal(committed.result.imported, 1);
  assert.equal(committed.result.skipped, 1);
  const bad = await app.request("/api/import/commit", {
    ...input,
    revision: committed.result.state.revision,
    content: Buffer.from(`Day,Reach\n${today()},180\n03/04/2026,190`).toString(
      "base64",
    ),
  });
  assert.equal(bad.status, 400);
  assert.match(bad.result.error, /Ambiguous dates/);
  assert.equal((await app.state()).metrics.length, 1);
});

test("XLSX preserves worksheet choice and Excel dates; formulas are never imported", async (t) => {
  const app = await setup(t),
    state = await app.state();
  const workbook = new ExcelJS.Workbook();
  const first = workbook.addWorksheet("Notes");
  first.addRow(["Description"]);
  first.addRow(["Ignore this sheet"]);
  const sheet = workbook.addWorksheet("Data");
  sheet.addRow(["Date", "Reach"]);
  sheet.addRow([new Date(`${today()}T00:00:00Z`), 170]);
  const base = {
    filename: "report.xlsx",
    content: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
    sheet: "Data",
  };
  const preview = await app.request("/api/import/preview", base);
  assert.equal(preview.status, 200);
  assert.deepEqual(preview.result.sheets, ["Notes", "Data"]);
  assert.equal(preview.result.rows[0].Date, today());
  const committed = await app.request("/api/import/commit", {
    ...base,
    revision: state.revision,
    mapping: { date: "Date", value: "Reach" },
    accountId: "account",
    kpiId: "reach",
  });
  assert.equal(committed.status, 200);
  assert.equal(committed.result.state.metrics[0].value, 170);
  sheet.getCell("B2").value = { formula: "1+1", result: 2 };
  const formula = await app.request("/api/import/commit", {
    ...base,
    content: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
    revision: committed.result.state.revision,
    mapping: { date: "Date", value: "Reach" },
    accountId: "account",
    kpiId: "reach",
  });
  assert.equal(formula.status, 400);
  assert.match(formula.result.error, /formulas cannot be imported/);
});

test("loopback security rejects foreign origins, hostile Host and non-JSON mutations", async (t) => {
  const app = await setup(t),
    state = await app.state();
  const input = {
    revision: state.revision,
    operations: [upsert("clients", { id: "client", name: "Unwanted" })],
  };
  assert.equal(
    (
      await app.request("/api/mutate", input, {
        Origin: "https://attacker.example",
      })
    ).status,
    403,
  );
  const hostileHostStatus = await new Promise((resolve, reject) => {
    const req = http.get(
      app.url + "/api/state",
      { headers: { Host: "attacker.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    req.on("error", reject);
  });
  assert.equal(hostileHostStatus, 403);
  assert.equal(
    (
      await fetch(app.url + "/api/mutate", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(input),
      })
    ).status,
    415,
  );
  assert.equal((await app.state()).clients[0].name, "Demo");
  assert.equal((await fetch(app.url + "/data/workspace.json")).status, 404);
  assert.equal((await fetch(app.url + "/%2eenv")).status, 404);
  const health = await app.request("/api/health");
  assert.equal(health.result.app, "marketing-control-center");
});

test("malformed state is preserved and returns a helpful safe error", async (t) => {
  const app = await setup(t);
  const bad = "{broken JSON";
  await fs.writeFile(app.dataFile, bad);
  const result = await app.request("/api/state");
  assert.equal(result.status, 503);
  assert.match(result.result.error, /preserved/);
  assert.ok(!result.result.error.includes(app.dir));
  assert.equal(await fs.readFile(app.dataFile, "utf8"), bad);
});

test("an empty folder initializes a usable empty workspace", async (t) => {
  const app = await setup(t);
  await fs.unlink(app.dataFile);
  const state = await app.state();
  assert.equal(state.schemaVersion, 1);
  assert.deepEqual(state.clients, []);
  assert.equal(typeof state.revision, "string");
});

test("imports percentage-point values consistently from Excel formatting and CSV", async (t) => {
  const app = await setup(t),
    state = await app.state();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Percentages");
  sheet.addRow(["Date", "Rate"]);
  sheet.addRow([new Date(`${today()}T00:00:00Z`), 0.045]);
  sheet.getCell("B2").numFmt = "0.0%";
  const payload = {
    filename: "percent.xlsx",
    content: Buffer.from(await workbook.xlsx.writeBuffer()).toString("base64"),
  };
  const preview = await app.request("/api/import/preview", payload);
  assert.equal(preview.result.rows[0].Rate, 4.5);
  const result = await app.request("/api/import/commit", {
    ...payload,
    revision: state.revision,
    mapping: { date: "Date", value: "Rate" },
    accountId: "account",
    kpiId: "reach",
  });
  assert.equal(result.status, 200);
  assert.equal(result.result.state.metrics[0].value, 4.5);
  const csv = {
    filename: "formatted.csv",
    content: Buffer.from(
      `Date,Value\n${today()},4.5%\n${today()},"1,234.5"\n`,
    ).toString("base64"),
    mapping: { date: "Date", value: "Value" },
    accountId: "account",
    kpiId: "reach",
    revision: result.result.state.revision,
  };
  const formatted = await app.request("/api/import/commit", csv);
  assert.equal(formatted.status, 200);
  assert.equal(formatted.result.imported, 1);
  assert.equal(formatted.result.skipped, 1);
  assert.equal(formatted.result.state.metrics.at(-1).value, 1234.5);
});
