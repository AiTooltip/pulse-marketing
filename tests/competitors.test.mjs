import test from "node:test";
import assert from "node:assert/strict";
import { today, addDays } from "../shared/domain.mjs";
import { benchmarkTable, gapInsights } from "../shared/competitors.mjs";
import { emptyState, validateState } from "../server/store.mjs";

function fixture() {
  const s = emptyState();
  s.clients.push({ id: "cl", name: "Client" });
  s.accounts.push({
    id: "ac",
    clientId: "cl",
    platform: "Instagram",
    kpis: [
      { id: "f", name: "Followers", direction: "increase" },
      { id: "e", name: "Engagement rate", direction: "increase" },
    ],
  });
  s.metrics.push(
    { id: "m1", accountId: "ac", kpiId: "f", date: addDays(today(), -3), value: 1000 },
    { id: "m2", accountId: "ac", kpiId: "e", date: addDays(today(), -3), value: 2 },
  );
  for (const [id, followers] of [["c1", 4000], ["c2", 2000]])
    s.competitors.push({ id, clientId: "cl", name: id, tier: "direct", threat: "medium", channels: [] });
  s.benchmarks.push(
    { id: "b1", competitorId: "c1", platform: "instagram", date: addDays(today(), -40), followers: 3000, engagementRate: 1 },
    { id: "b2", competitorId: "c1", platform: "Instagram", date: today(), followers: 4000, engagementRate: 1 },
    { id: "b3", competitorId: "c2", platform: "Instagram", date: today(), followers: 2000, engagementRate: 3 },
  );
  return s;
}

test("benchmark table uses newest snapshot, growth, share and own metrics", () => {
  const t = benchmarkTable(fixture(), "cl", "Instagram");
  const c1 = t.rows.find((r) => r.competitor.id === "c1");
  assert.equal(c1.followers, 4000);
  assert.ok(Math.abs(c1.growthPct - 33.333) < 0.01);
  assert.equal(t.you.followers, 1000);
  assert.ok(Math.abs(c1.share - (4000 / 7000) * 100) < 0.001);
  assert.equal(t.medians.followers, 3000);
});

test("gap insights compare you to the competitor median", () => {
  const g = gapInsights(benchmarkTable(fixture(), "cl", "Instagram"));
  assert.equal(g.find((x) => x.key === "followers").status, "behind");
  assert.equal(g.find((x) => x.key === "engagementRate").status, "level");
});

test("competitor records validate and protect references", () => {
  const s = fixture();
  assert.doesNotThrow(() => validateState(structuredClone(s)));
  const bad = fixture();
  bad.benchmarks.push({ id: "b9", competitorId: "c1", platform: "X", date: today() });
  assert.throws(() => validateState(bad), /at least one number/);
  const orphan = fixture();
  orphan.competitors = [];
  assert.throws(() => validateState(orphan), /missing competitors/);
});
