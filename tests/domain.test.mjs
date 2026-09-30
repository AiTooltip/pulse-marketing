import test from "node:test";
import assert from "node:assert/strict";
import {
  today,
  addDays,
  goalProgress,
  notifications,
  strategyPerformance,
} from "../shared/domain.mjs";

function fixture() {
  const now = today();
  return {
    settings: { postReviewDays: 7 },
    accounts: [
      {
        id: "a",
        kpis: [
          { id: "reach", name: "Reach" },
          { id: "cost", name: "Cost per lead" },
        ],
      },
    ],
    campaigns: [
      {
        id: "c",
        name: "Launch",
        startDate: addDays(now, -10),
        endDate: addDays(now, 10),
        nextReviewDate: now,
        reviewEveryDays: 30,
        status: "active",
        goals: [
          {
            id: "g",
            accountId: "a",
            kpiId: "reach",
            baseline: 100,
            target: 200,
          },
          {
            id: "costgoal",
            accountId: "a",
            kpiId: "cost",
            baseline: 20,
            target: 10,
          },
        ],
      },
    ],
    strategies: [
      {
        id: "s",
        name: "Short hooks",
        campaignId: "c",
        status: "testing",
        nextReviewDate: addDays(now, -1),
        reviewEveryDays: 7,
      },
    ],
    posts: [
      {
        id: "p",
        campaignId: "c",
        strategyId: "s",
        accountId: "a",
        title: "Hook test",
        format: "Reel",
        readiness: "ready",
        status: "executed",
        date: addDays(now, -8),
        executedAt: addDays(now, -8),
      },
    ],
    metrics: [],
    assessments: [],
    reminders: [],
  };
}

test("calendar arithmetic handles leap days and year boundaries", () => {
  assert.equal(addDays("2024-02-28", 1), "2024-02-29");
  assert.equal(addDays("2025-12-31", 1), "2026-01-01");
});

test("goal progress uses newest account snapshot and excludes attributed and other campaign observations", () => {
  const s = fixture(),
    c = s.campaigns[0],
    date = today();
  s.metrics = [
    { accountId: "a", kpiId: "reach", date: addDays(date, -2), value: 110 },
    { accountId: "a", kpiId: "reach", date, value: 160, campaignId: "c" },
    { accountId: "a", kpiId: "reach", date, value: 900, campaignId: "other" },
    { accountId: "a", kpiId: "reach", date, value: 800, strategyId: "s" },
    { accountId: "a", kpiId: "reach", date, value: 700, postId: "p" },
    { accountId: "a", kpiId: "reach", date: addDays(date, 1), value: 500 },
  ];
  const result = goalProgress(s, c, c.goals[0]);
  assert.equal(result.current, 160);
  assert.equal(result.percent, 60);
  assert.equal(result.expectedPercent, 50);
  assert.equal(result.onTrack, true);
  assert.deepEqual(
    result.history.map((m) => m.value),
    [110, 160],
  );
});

test("decreasing KPIs report improvement; absent observations stay distinct from baseline", () => {
  const s = fixture(),
    c = s.campaigns[0];
  assert.equal(goalProgress(s, c, c.goals[0]).hasData, false);
  assert.equal(goalProgress(s, c, c.goals[0]).onTrack, false);
  s.metrics.push({ accountId: "a", kpiId: "cost", date: today(), value: 15 });
  assert.equal(goalProgress(s, c, c.goals[1]).percent, 50);
});

test("notifications include configurable reviews, one follow-up per executed post, and gated progress alerts", () => {
  const s = fixture();
  s.reminders = [
    {
      id: "r",
      title: "Behind target",
      type: "progress",
      campaignId: "c",
      goalId: "g",
      comparison: "below",
      threshold: 50,
      done: false,
    },
    {
      id: "future",
      title: "Later check",
      type: "progress",
      campaignId: "c",
      goalId: "g",
      comparison: "below",
      threshold: 50,
      done: false,
      date: addDays(today(), 2),
    },
    {
      id: "distant",
      title: "Far away",
      type: "date",
      date: addDays(today(), 30),
      done: false,
    },
  ];
  const ids = notifications(s).map((n) => n.id);
  assert.deepEqual(
    ids.sort(),
    ["strategy:s", "campaign:c", "assess:p", "reminder:r"].sort(),
  );
  s.assessments.push({ entityType: "post", entityId: "p", date: today() });
  assert.ok(!notifications(s).some((n) => n.id === "assess:p"));
});

test("strategy rankings use explicit attribution, latest per post, and do not claim causality", () => {
  const s = fixture();
  s.metrics = [
    {
      accountId: "a",
      kpiId: "reach",
      date: addDays(today(), -2),
      value: 120,
      postId: "p",
    },
    { accountId: "a", kpiId: "reach", date: today(), value: 175, postId: "p" },
    { accountId: "a", kpiId: "reach", date: today(), value: 900 },
  ];
  const result = strategyPerformance(s, s.strategies[0]);
  assert.equal(result.score, 75);
  assert.equal(result.samples, 2);
  assert.equal(result.metrics.length, 1);
  assert.match(result.interpretation, /not proof of causality/);
});
