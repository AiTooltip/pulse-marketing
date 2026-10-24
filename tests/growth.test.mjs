import test from "node:test";
import assert from "node:assert/strict";
import { changeTone, measureTrend } from "../shared/analysis.mjs";

const mk = (rows) => ({
  accounts: [{ id: "a", kpis: [{ id: "k", name: "Followers", unit: "people", direction: "increase" }] }],
  metrics: rows.map(([date, value, periodDays], i) => ({ id: `m${i}`, accountId: "a", kpiId: "k", date, value, periodDays })),
  posts: [],
});

test("running total growth uses first and last snapshot in the window", () => {
  const t = measureTrend(mk([["2026-09-01", 100], ["2026-09-15", 110], ["2026-09-29", 130]]), { accountId: "a", kpiId: "k", from: "2026-09-01", to: "2026-09-30" });
  assert.equal(t.ok, true);
  assert.equal(t.gain, 30);
  assert.equal(Math.round(t.pct), 30);
});

test("a single snapshot is not reported as growth", () => {
  const t = measureTrend(mk([["2026-09-10", 100]]), { accountId: "a", kpiId: "k", from: "2026-09-01", to: "2026-09-30" });
  assert.equal(t.ok, false);
  assert.equal(t.latest.value, 100);
});

test("windowed measures compare with the previous window, else recent vs earlier half", () => {
  const prevWindow = measureTrend(mk([["2026-08-20", 100, 7], ["2026-09-10", 150, 7]]), { accountId: "a", kpiId: "k", periodDays: 7, from: "2026-09-01", to: "2026-09-30" });
  assert.equal(prevWindow.halves, false);
  assert.equal(prevWindow.pct, 50);
  const halves = measureTrend(mk([["2026-09-02", 10, 7], ["2026-09-09", 10, 7], ["2026-09-16", 20, 7], ["2026-09-23", 20, 7]]), { accountId: "a", kpiId: "k", periodDays: 7, from: "2026-09-01", to: "2026-09-30" });
  assert.equal(halves.halves, true);
  assert.equal(halves.pct, 100);
});

test("tone respects KPI direction", () => {
  assert.equal(changeTone(5, "increase"), "green");
  assert.equal(changeTone(5, "decrease"), "red");
  assert.equal(changeTone(0.1, "increase"), "neutral");
});
