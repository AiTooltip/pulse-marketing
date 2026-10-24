import test from "node:test";
import assert from "node:assert/strict";
import {
  channelSeries,
  effectOnChannel,
  intervalsOf,
  judge,
  median,
  periodSummary,
  strategyGroups,
  videoRows,
} from "../shared/analysis.mjs";

const state = () => ({
  clients: [{ id: "c", name: "C" }],
  accounts: [
    {
      id: "yt",
      clientId: "c",
      platform: "YouTube",
      handle: "@c",
      name: "",
      kpis: [{ id: "views", name: "Views", unit: "views", direction: "increase" }],
    },
  ],
  campaigns: [],
  strategies: [{ id: "s1", name: "Face" }],
  posts: [
    { id: "p1", accountId: "yt", title: "A", date: "2026-03-10", status: "executed", executedAt: "2026-03-10", strategyId: "s1" },
    { id: "p2", accountId: "yt", title: "B", date: "2026-03-24", status: "executed", executedAt: "2026-03-24" },
  ],
  metrics: [
    ...[["2026-03-01", 100], ["2026-03-08", 100], ["2026-03-15", 200], ["2026-03-22", 220], ["2026-03-29", 210], ["2026-04-05", 150]].map(
      ([date, value], i) => ({ id: `w${i}`, accountId: "yt", kpiId: "views", date, value, periodDays: 7 }),
    ),
    { id: "v1", accountId: "yt", kpiId: "views", date: "2026-03-17", value: 900, periodDays: 7, postId: "p1" },
    { id: "v2", accountId: "yt", kpiId: "views", date: "2026-03-31", value: 300, periodDays: 7, postId: "p2" },
  ],
});

test("channel series excludes video-level numbers and other windows", () => {
  const s = channelSeries(state(), "yt", "views", 7);
  assert.equal(s.length, 6);
  assert.equal(s.some((p) => p.value === 900), false);
  assert.equal(channelSeries(state(), "yt", "views", 0).length, 0);
});

test("effect uses only periods fully before and fully after the upload", () => {
  const st = state();
  const e = effectOnChannel(st, st.posts[0], "yt", { kpiId: "views", periodDays: 7 }, 1);
  // upload 10 Mar: week ending 8 Mar is before; week 10-16 Mar straddles? 9-15 Mar starts 9 Mar <10, skipped.
  assert.equal(e.ok, true);
  assert.equal(e.before[0].end, "2026-03-08");
  assert.equal(e.after[0].start >= "2026-03-10", true);
  assert.equal(e.after[0].end, "2026-03-22");
});

test("effect reports missing data instead of guessing", () => {
  const st = state();
  const e = effectOnChannel(st, { ...st.posts[0], executedAt: "2026-02-01", date: "2026-02-01" }, "yt", { kpiId: "views", periodDays: 7 });
  assert.equal(e.ok, false);
});

test("running totals become gain per week", () => {
  const ints = intervalsOf([{ date: "2026-03-01", value: 100 }, { date: "2026-03-15", value: 128 }], 0);
  assert.equal(ints.length, 1);
  assert.equal(ints[0].value, 14);
});

test("judge compares with the median of your own videos and needs 3+", () => {
  assert.equal(judge(900, [900, 300]).tone, "neutral");
  assert.equal(median([1, 2, 3, 10]), 2.5);
  const j = judge(900, [900, 300, 320, 310]);
  assert.equal(j.label, "above typical");
  assert.equal(judge(200, [900, 300, 320, 310]).tone, "red");
  assert.equal(judge(200, [900, 300, 320, 310], "decrease").tone, "green");
});

test("video rows, strategy groups and period summary", () => {
  const st = state();
  const rows = videoRows(st, { accountId: "yt" });
  assert.equal(rows.length, 2);
  const g = strategyGroups(rows, "views|7", st.strategies);
  assert.equal(g.find((x) => x.id === "s1").avg, 900);
  assert.equal(g.find((x) => x.id === "none").avg, 300);
  const p = periodSummary(st, { accountId: "yt", from: "2026-03-01", to: "2026-03-31", channel: { kpiId: "views", periodDays: 7 }, video: "views|7" });
  assert.equal(p.uploads, 2);
  assert.equal(p.videoAvg, 600);
  assert.equal(p.points, 5);
});

import { notifications } from "../shared/domain.mjs";
test("a strategy saved with only a name raises an 'add details' reminder until details are added", () => {
  const st = state();
  st.campaigns = [{ id: "camp", clientId: "c", name: "Camp", status: "active", reviewEveryDays: 30, nextReviewDate: "2099-01-01", goals: [] }];
  st.assessments = [];
  st.reminders = [];
  st.strategies = [{ id: "s2", campaignId: "camp", name: "New idea", status: "testing", reviewEveryDays: 7, nextReviewDate: "2099-01-01", needsDetails: true }];
  const n = notifications(st, "2026-10-01").find((x) => x.id === "details:s2");
  assert.equal(n.kind, "details");
  assert.equal(n.severity, "due");
  delete st.strategies[0].needsDetails;
  assert.equal(notifications(st, "2026-10-01").some((x) => x.id === "details:s2"), false);
});

import { headToHead, tacticTheories } from "../shared/analysis.mjs";
const tacticState = (n, winRate = 1) => {
  const st = state();
  st.tactics = [{ id: "t1", name: "CTA early" }, { id: "t2", name: "Casual" }];
  st.posts = [];
  st.metrics = [];
  const add = (i, tacticIds, value) => {
    st.posts.push({ id: `p${i}`, accountId: "yt", title: `V${i}`, date: "2026-03-01", status: "executed", executedAt: "2026-03-01", tacticIds });
    st.metrics.push({ id: `m${i}`, accountId: "yt", kpiId: "views", date: "2026-03-08", value, periodDays: 7, postId: `p${i}` });
  };
  // 4 baseline videos without the tactic, around 100
  [90, 100, 110, 100].forEach((v, i) => add(`b${i}`, [], v));
  for (let i = 0; i < n; i++) add(`w${i}`, i % 2 ? ["t1", "t2"] : ["t1"], i < n * winRate ? 200 : 50);
  return st;
};
test("theories: a tactic becomes proven only after 5 tests with 80% beating the baseline", () => {
  const run = (n, rate) => tacticTheories(tacticState(n, rate), { accountId: "yt", measure: "views|7" }).find((t) => t.tactic.id === "t1");
  assert.equal(run(2, 1).status, "hypothesis");
  assert.equal(run(3, 1).status, "emerging");
  assert.equal(run(4, 1).moreNeeded, 1);
  assert.equal(run(5, 1).status, "proven");
  assert.equal(run(5, 0.8).status, "proven");
  assert.equal(run(5, 0.6).status, "mixed");
  assert.equal(run(5, 0.2).status, "not-holding");
  assert.equal(run(5, 1).lift > 0, true);
});
test("theories need videos without the tactic to compare against; head to head splits groups", () => {
  const st = tacticState(3, 1);
  st.posts = st.posts.filter((p) => p.id.startsWith("pw"));
  st.metrics = st.metrics.filter((m) => m.postId.startsWith("pw"));
  assert.equal(tacticTheories(st, { accountId: "yt", measure: "views|7" }).find((t) => t.tactic.id === "t1").status, "no-baseline");
  const hh = headToHead(tacticState(4, 1), { accountId: "yt", measure: "views|7", a: "t1", b: "t2" });
  assert.equal(hh.both.n, 2);
  assert.equal(hh.onlyA.n, 2);
  assert.equal(hh.onlyB.n, 0);
  assert.equal(hh.neither.n, 4);
});

import { evaluateTheory } from "../shared/analysis.mjs";
test("a tracked theory counts only videos uploaded since it started as tests", () => {
  const st = tacticState(0);
  const add = (i, upload, value) => {
    st.posts.push({ id: `px${i}`, accountId: "yt", title: `X${i}`, date: upload, status: "executed", executedAt: upload, tacticIds: ["t1"] });
    st.metrics.push({ id: `mx${i}`, accountId: "yt", kpiId: "views", date: upload, value, periodDays: 7, postId: `px${i}` });
  };
  add(0, "2026-02-01", 300); // before the theory: evidence
  add(1, "2026-04-01", 250);
  add(2, "2026-04-08", 260);
  add(3, "2026-04-15", 40);
  const theory = { id: "th", tacticId: "t1", accountId: "yt", kpiId: "views", periodDays: 7, statement: "s", startedAt: "2026-03-15", status: "testing" };
  let e = evaluateTheory(st, theory);
  assert.equal(e.evidence.length, 1);
  assert.equal(e.tests.length, 3);
  assert.equal(e.beat, 2);
  assert.equal(e.moreNeeded, 2);
  assert.equal(e.ready, "testing");
  add(4, "2026-04-22", 270);
  add(5, "2026-04-29", 280);
  e = evaluateTheory(st, theory);
  assert.equal(e.tests.length, 5);
  assert.equal(e.ready, "ready-proven" === e.ready ? "ready-proven" : e.ready);
  assert.equal(e.rate, 0.8);
  assert.equal(e.ready, "ready-proven");
});

import { groupVideos } from "../shared/analysis.mjs";
test("groups compare videos by tactic, content type and weekday", () => {
  const st = tacticState(2, 1);
  st.campaigns = [{ id: "c1", name: "Camp" }];
  st.posts.forEach((p) => { p.campaignId = "c1"; p.format = p.id.startsWith("pw") ? "Reel" : "Video"; });
  const rows = videoRows(st, { accountId: "yt" });
  const byTactic = groupVideos(st, rows, "tactic", "views|7");
  assert.equal(byTactic.find((g) => g.id === "t1").n, 2);
  assert.equal(byTactic.find((g) => g.id === "none").n, 4);
  assert.equal(groupVideos(st, rows, "format", "views|7").find((g) => g.name === "Reel").n, 2);
  assert.equal(groupVideos(st, rows, "campaign", "views|7")[0].n, 6);
  assert.equal(groupVideos(st, rows, "weekday", "views|7")[0].name, "Sunday");
});

import { tacticLifecycle } from "../shared/analysis.mjs";
test("tactic lifecycle follows the evidence, and your own status wins", () => {
  const st = tacticState(5, 1);
  st.theories = [];
  const t1 = st.tactics[0];
  assert.equal(tacticLifecycle(st, t1).status, "promising");
  assert.equal(tacticLifecycle(st, { id: "unused", name: "Nope" }).status, "idea");
  st.theories = [{ id: "th", tacticId: "t1", status: "proven" }];
  assert.equal(tacticLifecycle(st, t1).status, "proven");
  // Adopted is a decision, separate from proven.
  assert.equal(tacticLifecycle(st, { ...t1, status: "adopted" }).status, "adopted");
  assert.equal(tacticLifecycle(st, { ...t1, status: "adopted" }).auto, false);
  st.theories = [{ id: "th", tacticId: "t1", status: "disproven" }];
  st.posts.forEach((p) => { p.tacticIds = []; });
  assert.equal(tacticLifecycle(st, t1).status, "paused");
  const fresh = tacticState(1, 1);
  fresh.theories = [];
  assert.equal(tacticLifecycle(fresh, fresh.tactics[0]).status, "testing");
});

test("a video saved with 'add tactics later' raises a reminder until tactics are tagged", () => {
  const st = state();
  st.campaigns = [];
  st.assessments = [{ id: "a1", entityType: "post", entityId: "p1", date: "2026-12-31" }, { id: "a2", entityType: "post", entityId: "p2", date: "2026-12-31" }];
  st.reminders = [];
  st.posts[0].tacticsLater = true;
  let n = notifications(st, "2026-10-01").find((x) => x.id === "tactics:p1");
  assert.equal(n.kind, "tactics");
  assert.equal(notifications(st, "2026-10-01").some((x) => x.id === "tactics:p2"), false);
  st.posts[0].tacticIds = ["t1"];
  assert.equal(notifications(st, "2026-10-01").some((x) => x.id === "tactics:p1"), false);
});
