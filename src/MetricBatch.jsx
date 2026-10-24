import { useState } from "react";
import { Check, Info, LoaderCircle, Plus, Trash2 } from "lucide-react";
import TacticPicker, { pendingTacticOps } from "./TacticPicker.jsx";
import { SUGGESTED_STRATEGIES } from "./suggestions.js";
import {
  Dialog,
  Field,
  NumInput,
  PeriodSelect,
  niceDate,
  parseDuration,
  uid,
} from "./components.jsx";
import { addDays, today } from "../shared/domain.mjs";

const MONTHS = "jan feb mar apr may jun jul aug sep oct nov dec".split(" ");
const SLASH = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/;
const iso = (y, m, d) => {
  const text = `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  return !Number.isNaN(Date.parse(`${text}T12:00:00Z`)) &&
    new Date(`${text}T12:00:00Z`).toISOString().slice(0, 10) === text
    ? text
    : null;
};
/**
 * Work out whether slash dates in a pasted batch are day/month or month/day.
 * 21/09/2026 can only be day-first; 09/21/2026 only month-first. If every date
 * is ambiguous (e.g. 03/04/2026) day-first is assumed. Returns null if mixed.
 */
function detectOrder(texts) {
  let dmy = false,
    mdy = false;
  for (const t of texts) {
    const m = String(t).trim().match(SLASH);
    if (!m) continue;
    if (Number(m[1]) > 12) dmy = true;
    if (Number(m[2]) > 12) mdy = true;
  }
  return dmy && mdy ? null : mdy ? "mdy" : "dmy";
}
/** One date cell → YYYY-MM-DD or null. 2026-03-14, 14 Mar 2026, Mar 14 2026, 21/09/2026, 21.09.2026 */
function parseDate(text, order = "dmy") {
  const t = String(text).trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return iso(m[1], m[2], m[3]);
  m = t.match(SLASH);
  if (m)
    return order === "mdy" ? iso(m[3], m[1], m[2]) : iso(m[3], m[2], m[1]);
  m =
    t.match(/^(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/) ||
    t.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const [d, mon, y] = /^\d/.test(m[1]) ? [m[1], m[2], m[3]] : [m[2], m[1], m[3]];
  const mi = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
  return mi < 0 ? null : iso(y, mi + 1, d);
}
const DATE_HELP = "Use 21/09/2026, 2026-09-21 or 21 Sep 2026.";
/** One value cell → numeric string, or null. Accepts 1,250  1 250  $12.5  4.5% */
function parseNum(text, unit) {
  if (unit === "h:m:s" || unit === "m:s") {
    const d = parseDuration(text);
    return d === null ? null : String(d);
  }
  const t = String(text).trim().replace(/[\s$€£%]/g, "").replace(/,/g, "");
  return t !== "" && Number.isFinite(Number(t)) ? t : null;
}

const rowsForAccount = (account, firstKpiId) =>
  [...(account?.kpis || [])]
    .sort((a, b) => (b.id === firstKpiId) - (a.id === firstKpiId))
    .map((k) => ({
      key: uid("row"),
      accountId: account.id,
      kpiId: k.id,
      value: "",
    }));

/** Add several metrics in one go: one date, optional attribution, many KPI rows. */
export default function MetricBatch({
  state,
  prefill,
  clientId,
  onSaveMany,
  onClose,
  openStrategy,
  openResults,
}) {
  const NEW_STRATEGY = "__new_strategy__";
  const startAccount =
    state.accounts.find((a) => a.id === prefill.accountId) ||
    state.accounts.find((a) => clientId !== "all" && a.clientId === clientId) ||
    state.accounts[0];
  const [date, setDate] = useState(prefill.date || today());
  // What are these numbers about: the whole account/channel, or one video/post?
  const [scope, setScope] = useState(
    prefill.postId || prefill.strategyId ? "post" : "account",
  );
  const [campaignId, setCampaignId] = useState(prefill.campaignId || "");
  const [strategyId, setStrategyId] = useState(prefill.strategyId || "");
  const [tacticIds, setTacticIds] = useState(
    state.posts.find((p) => p.id === prefill.postId)?.tacticIds || [],
  );
  const [alsoOn, setAlsoOn] = useState("");
  // One type of number for the whole entry (rows can override it).
  const [sharedPeriod, setSharedPeriod] = useState(
    prefill.periodDays ? String(prefill.periodDays) : "",
  );
  const periodOf = (r) => (r.periodDays !== undefined ? r.periodDays : sharedPeriod);
  const [pendingTactics, setPendingTactics] = useState([]);
  const [tacticsLater, setTacticsLater] = useState(
    Boolean(state.posts.find((p) => p.id === prefill.postId)?.tacticsLater),
  );
  const [newStrategyName, setNewStrategyName] = useState("");
  const [newStrategyIdea, setNewStrategyIdea] = useState("");
  const [newStrategyCampaign, setNewStrategyCampaign] = useState("");
  const [strategyLater, setStrategyLater] = useState(
    Boolean(state.posts.find((p) => p.id === prefill.postId)?.strategyLater),
  );
  const [detailsNow, setDetailsNow] = useState(false);
  const [newStrategyId] = useState(() => uid("strategy"));
  // The strategy these numbers are saved under (a brand-new one gets its id up front).
  const effStrategyId = strategyId === NEW_STRATEGY ? newStrategyId : strategyId;
  const [postId, setPostId] = useState(prefill.postId || "");
  const NEW_VIDEO = "__new__";
  const prefillPost = state.posts.find((p) => p.id === prefill.postId);
  const [videoName, setVideoName] = useState(prefillPost?.title || "");
  const [uploadDate, setUploadDate] = useState(
    prefillPost ? prefillPost.executedAt || prefillPost.date : "",
  );
  const [daysAfter, setDaysAfter] = useState(() => {
    if (prefill.periodDays) return String(prefill.periodDays);
    return "7";
  });
  const [rows, setRows] = useState(() =>
    rowsForAccount(startAccount, prefill.kpiId),
  );
  // "dates" = one KPI, many dates; a video's results default to many KPIs, one date
  const [mode, setMode] = useState(prefill.postId ? "kpis" : "dates");
  const [series, setSeries] = useState({
    accountId: startAccount?.id || "",
    kpiId: prefill.kpiId || startAccount?.kpis[0]?.id || "",
    periodDays: prefill.periodDays || "",
  });
  const [seriesRows, setSeriesRows] = useState([
    { key: uid("row"), date: "", value: "" },
  ]);
  const [pasteDates, setPasteDates] = useState("");
  const [pasteValues, setPasteValues] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const accountOf = (id) => state.accounts.find((a) => a.id === id);
  const capToday = (d) => (d > today() ? today() : d);
  const gap = (a, b) =>
    Math.round(
      (new Date(`${b}T12:00:00Z`) - new Date(`${a}T12:00:00Z`)) / 86400000,
    );
  const changeUpload = (v) => {
    setUploadDate(v);
    if (v) {
      setDate(capToday(addDays(v, Number(daysAfter) || 0)));
      setRows((list) => list.map((r) => ({ ...r, date: "" })));
    }
  };
  const changeDaysAfter = (v) => {
    const n = Number(v);
    setDaysAfter(v);
    if (uploadDate && n >= 0) {
      setDate(capToday(addDays(uploadDate, n)));
      setRows((list) => list.map((r) => ({ ...r, date: "" })));
    } else if (!uploadDate && n >= 0 && postId) {
      // No upload date yet: keep the collected date and work the upload date out.
      setUploadDate(addDays(date, -n));
    }
    // The shared type follows the new window when it matched the old one.
    if (n >= 1 && String(sharedPeriod) === String(daysAfter))
      setSharedPeriod(String(n));
  };
  const changeCollected = (v) => {
    setDate(v);
    if (!uploadDate && v && postId)
      setUploadDate(addDays(v, -(Number(daysAfter) || 0)));
    setRows((list) => list.map((r) => ({ ...r, date: "" })));
    if (uploadDate && v && v >= uploadDate) {
      const n = gap(uploadDate, v);
      if (n >= 1 && String(sharedPeriod) === String(daysAfter))
        setSharedPeriod(String(n));
      setDaysAfter(String(n));
    }
  };
  const post = state.posts.find((p) => p.id === postId);
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  const scopeClientId = campaign?.clientId || accountOf(rows[0]?.accountId)?.clientId;
  const accountOptions = state.accounts.filter(
    (a) =>
      (!post || a.id === post.accountId) &&
      (!campaign || a.clientId === campaign.clientId),
  );
  const campaignOptions = state.campaigns.filter(
    (c) => !scopeClientId || c.clientId === scopeClientId,
  );
  const postOptions = state.posts.filter(
    (p) =>
      p.campaignId === campaignId &&
      (!strategyId || strategyId === NEW_STRATEGY || p.strategyId === strategyId),
  );

  const curAccountId = mode === "dates" ? series.accountId : rows[0]?.accountId || series.accountId;
  const accountPosts = state.posts
    .filter((p) => p.accountId === curAccountId && p.status !== "cancelled")
    .sort((a, b) =>
      (b.executedAt || b.date).localeCompare(a.executedAt || a.date),
    );
  const clientOfAccount = accountOf(curAccountId)?.clientId;
  const strategyOptions = state.strategies.filter((s) =>
    campaignId
      ? s.campaignId === campaignId
      : state.campaigns.find((c) => c.id === s.campaignId)?.clientId ===
        clientOfAccount,
  );
  const switchAccount = (id) => {
    const account = accountOf(id);
    setSeries({ ...series, accountId: id, kpiId: account?.kpis[0]?.id || "" });
    setRows(rowsForAccount(account));
  };
  const setRow = (key, patch) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const addRow = () => {
    const base = accountOf(rows.at(-1)?.accountId) || accountOptions[0];
    const used = new Set(
      rows.filter((r) => r.accountId === base?.id).map((r) => r.kpiId),
    );
    const next = base?.kpis.find((k) => !used.has(k.id)) || base?.kpis[0];
    if (!base || !next) return;
    setRows((list) => [
      ...list,
      {
        key: uid("row"),
        accountId: base.id,
        kpiId: next.id,
        value: "",
      },
    ]);
  };
  const addAllFor = (accountId) => {
    const account = accountOf(accountId);
    const have = new Set(
      rows.filter((r) => r.accountId === accountId).map((r) => r.kpiId),
    );
    const missing = (account?.kpis || []).filter((k) => !have.has(k.id));
    if (missing.length)
      setRows((list) => [
        ...list,
        ...missing.map((k) => ({
          key: uid("row"),
          accountId,
          kpiId: k.id,
          value: "",
        })),
      ]);
  };
  const chooseCampaign = (v) => {
    setCampaignId(v);
    if (scope !== "post") {
      setStrategyId("");
      setPostId("");
    } else if (
      strategyId &&
      strategyId !== NEW_STRATEGY &&
      state.strategies.find((x) => x.id === strategyId)?.campaignId !== v
    )
      setStrategyId("");
    const c = state.campaigns.find((x) => x.id === v);
    if (c) {
      const valid = rows.filter(
        (r) => accountOf(r.accountId)?.clientId === c.clientId,
      );
      if (valid.length !== rows.length)
        setRows(
          valid.length
            ? valid
            : rowsForAccount(
                state.accounts.find((a) => a.clientId === c.clientId),
              ),
        );
    }
  };
  const choosePost = (v) => {
    setPostId(v);
    if (v === NEW_VIDEO) {
      setTacticIds([]);
      setTacticsLater(false);
      setVideoName("");
      // Start from the collected date so the two stay linked right away.
      setUploadDate(addDays(date, -(Number(daysAfter) || 0)));
      return;
    }
    const p = state.posts.find((x) => x.id === v);
    if (!p) return;
    setTacticIds(p.tacticIds || []);
    setTacticsLater(Boolean(p.tacticsLater));
    setStrategyLater(Boolean(p.strategyLater));
    setVideoName(p.title);
    setUploadDate(p.executedAt || p.date);
    setDate(capToday(addDays(p.executedAt || p.date, Number(daysAfter) || 0)));
    setStrategyId(p.strategyId || "");
    setCampaignId(p.campaignId || "");
    const account = accountOf(p.accountId);
    const kept = rows
      .filter((r) => r.accountId === p.accountId)
      .map((r) => ({ ...r }));
    setRows(kept.length ? kept : rowsForAccount(account));
  };

  const filled = (
    mode === "dates"
      ? seriesRows
          .filter((r) => String(r.value).trim() !== "")
          .map((r) => ({ ...series, ...r }))
      : rows
          .filter((r) => String(r.value).trim() !== "")
          .map((r) => ({ ...r, periodDays: periodOf(r) }))
  );
  const addSeriesRow = () =>
    setSeriesRows((list) => {
      const last = list.at(-1)?.date;
      const step = Number(series.periodDays) || 1;
      const next = last ? addDays(last, step) : "";
      return [
        ...list,
        { key: uid("row"), date: next && next <= today() ? next : "", value: "" },
      ];
    });
  const seriesUnit = accountOf(series.accountId)?.kpis.find(
    (k) => k.id === series.kpiId,
  )?.unit;
  const lines = (t) =>
    t
      .replace(/\r/g, "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l, i, all) => l !== "" || i < all.length - 1);
  /** Spread pasted cells down the table starting at a row, like a spreadsheet. */
  const fillFrom = (startKey, cells) =>
    setSeriesRows((list) => {
      const copy = list.map((r) => ({ ...r }));
      let at = Math.max(0, copy.findIndex((r) => r.key === startKey));
      for (const patch of cells) {
        if (!copy[at]) copy.push({ key: uid("row"), date: "", value: "" });
        copy[at] = { ...copy[at], ...patch };
        at++;
      }
      return copy;
    });
  const pasteInto = (field) => (e) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t]/.test(text.trim())) return; // single cell: normal paste
    e.preventDefault();
    const rowsText = lines(text).filter((l) => l !== "");
    const key = e.currentTarget.dataset.row;
    const cells = [];
    const order = detectOrder(rowsText.map((l) => l.split("\t")[0]));
    if (!order)
      return setError(
        "These dates mix day/month and month/day order (e.g. 21/09 and 09/21). Use one format.",
      );
    for (const line of rowsText) {
      const parts = line.split("\t").map((p) => p.trim());
      const maybeDate = parseDate(parts[0], order);
      if (parts.length > 1 && maybeDate) {
        const v = parseNum(parts[1], seriesUnit);
        if (v === null) return setError(`Could not read “${parts[1]}” as a number.`);
        cells.push({ date: maybeDate, value: v });
      } else if (field === "date") {
        const d = parseDate(parts[0], order);
        if (!d)
          return setError(`Could not read “${parts[0]}” as a date. ${DATE_HELP}`);
        cells.push({ date: d });
      } else {
        const v = parseNum(parts[0], seriesUnit);
        if (v === null) return setError(`Could not read “${parts[0]}” as a number.`);
        cells.push({ value: v });
      }
    }
    setError("");
    fillFrom(key, cells);
  };
  /** Pair the pasted dates with the pasted values. */
  const matchLists = () => {
    const ds = lines(pasteDates).filter((l) => l !== "");
    const vs = lines(pasteValues).filter((l) => l !== "");
    if (ds.length !== vs.length)
      return {
        error: `You pasted ${ds.length} date${ds.length === 1 ? "" : "s"} but ${vs.length} value${vs.length === 1 ? "" : "s"}. They need to match, one value per date.`,
      };
    const order = detectOrder(ds);
    if (!order)
      return {
        error:
          "These dates mix day/month and month/day order (e.g. 21/09 and 09/21). Use one format.",
      };
    const cells = [];
    for (let i = 0; i < ds.length; i++) {
      const d = parseDate(ds[i], order);
      const v = parseNum(vs[i], seriesUnit);
      if (!d) return { error: `Could not read “${ds[i]}” as a date. ${DATE_HELP}` };
      if (v === null) return { error: `Could not read “${vs[i]}” as a number.` };
      cells.push({ date: d, value: v });
    }
    return { cells };
  };
  const fillFromLists = () => {
    const r = matchLists();
    if (r.error) return setError(r.error);
    setError("");
    setSeriesRows((list) => [
      ...list.filter((x) => x.date || String(x.value).trim()),
      ...r.cells.map((c) => ({ key: uid("row"), ...c })),
    ]);
    setPasteDates("");
    setPasteValues("");
  };

  const pendingCount =
    mode === "dates" && pasteDates.trim() && pasteValues.trim()
      ? Math.min(
          lines(pasteDates).filter(Boolean).length,
          lines(pasteValues).filter(Boolean).length,
        )
      : 0;
  const savingCount = filled.length + pendingCount;

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    // Pasted-but-not-yet-matched lists are included when you press Save.
    let toSave = filled;
    if (mode === "dates" && (pasteDates.trim() || pasteValues.trim())) {
      const r = matchLists();
      if (r.error) return setError(r.error);
      toSave = [...filled, ...r.cells.map((c) => ({ ...series, ...c }))];
    }
    if (!toSave.length) {
      setError(
        mode === "dates"
          ? "Nothing to save yet. Add a date and a value in the table, or paste your dates and values into the two boxes."
          : "Enter at least one value. Leave a row empty to skip it.",
      );
      return;
    }
    if (mode === "dates" && toSave.some((r) => !r.date)) {
      setError("Every number in the list needs a date.");
      return;
    }
    if (mode === "dates" && toSave.some((r) => r.date > today())) {
      setError("Dates cannot be in the future.");
      return;
    }
    const bad = toSave.find((r) => !Number.isFinite(Number(r.value)));
    if (bad) {
      setError("Values must be numbers, for example 1250 or 4.5.");
      return;
    }
    if (strategyId === NEW_STRATEGY && !campaignId && !newStrategyCampaign) {
      setError("A new strategy belongs to a campaign. Pick one for it, or choose a campaign for the video.");
      return;
    }
    if (strategyId === NEW_STRATEGY && !newStrategyName.trim()) {
      setError("Give the new strategy a name, or choose None.");
      return;
    }
    if (scope === "post" && !postId) {
      setError("Choose the video or post these numbers belong to, or switch to “Whole channel / account”.");
      return;
    }
    if (postId && !videoName.trim()) {
      setError("Give the video a name.");
      return;
    }
    if (postId && !uploadDate) {
      setError("Enter the date the video was uploaded.");
      return;
    }
    if (postId && toSave.some((r) => (r.date || date) < uploadDate)) {
      setError("Numbers can't be collected before the video was uploaded. Check the dates.");
      return;
    }
    if (postId === NEW_VIDEO) {
      if (new Set(toSave.map((r) => r.accountId)).size > 1) {
        setError("A video belongs to one account. Keep all rows on the same account.");
        return;
      }
    }
    const seen = new Set();
    for (const r of toSave) {
      const key = `${r.accountId}:${r.kpiId}:${r.periodDays || 0}:${r.date || date}`;
      if (seen.has(key)) {
        setError(
          "The same measure appears twice for the same date and type of number. Remove the duplicate or change its date.",
        );
        return;
      }
      seen.add(key);
    }
    setBusy(true);
    try {
      const videoOps = [];
      let metricPostId = postId;
      if (postId === NEW_VIDEO) {
        metricPostId = uid("post");
        videoOps.push({
          op: "upsert",
          collection: "posts",
          value: {
            id: metricPostId,
            ...(campaignId ? { campaignId } : {}),
            accountId: toSave[0].accountId,
            ...(effStrategyId ? { strategyId: effStrategyId } : {}),
            ...(strategyLater && !effStrategyId ? { strategyLater: true } : {}),
            ...(tacticIds.length ? { tacticIds } : {}),
            ...(tacticsLater && !tacticIds.length ? { tacticsLater: true } : {}),
            title: videoName.trim(),
            format: "Video",
            date: uploadDate,
            status: "executed",
            executedAt: uploadDate,
            readiness: "ready",
            notes: "",
            url: "",
            reviewAfterDays: 7,
          },
        });
      } else if (post) {
        const title = videoName.trim();
        const changed =
          title !== post.title ||
          uploadDate !== (post.executedAt || post.date) ||
          post.status !== "executed" ||
          (effStrategyId || "") !== (post.strategyId || "") ||
          JSON.stringify([...tacticIds].sort()) !==
            JSON.stringify([...(post.tacticIds || [])].sort()) ||
          Boolean(tacticsLater && !tacticIds.length) !== Boolean(post.tacticsLater) ||
          Boolean(strategyLater && !effStrategyId) !== Boolean(post.strategyLater);
        if (changed)
          videoOps.push({
            op: "upsert",
            collection: "posts",
            value: {
              ...(({ tacticsLater: _l, strategyLater: _sl, ...rest }) => rest)(post),
              title,
              date: uploadDate,
              status: "executed",
              executedAt: uploadDate,
              ...(effStrategyId ? { strategyId: effStrategyId } : {}),
              tacticIds,
              ...(tacticsLater && !tacticIds.length ? { tacticsLater: true } : {}),
              ...(strategyLater && !effStrategyId ? { strategyLater: true } : {}),
            },
          });
      }
      if (postId) videoOps.unshift(...pendingTacticOps(pendingTactics, tacticIds));
      if (post)
        for (const m of state.metrics)
          if (m.postId === post.id && m.strategyId && m.strategyId !== effStrategyId) {
            // The video's strategy changed; older numbers must not keep the old one.
            const { strategyId: _s, ...rest } = m;
            videoOps.push({ op: "upsert", collection: "metrics", value: rest });
          }
      if (strategyId === NEW_STRATEGY)
        videoOps.unshift({
          op: "upsert",
          collection: "strategies",
          value: {
            id: newStrategyId,
            campaignId: campaignId || newStrategyCampaign,
            name: newStrategyName.trim(),
            hypothesis: newStrategyIdea,
            changes: "",
            keep: "",
            status: "testing",
            reviewEveryDays: 7,
            nextReviewDate: addDays(today(), 7),
            ...(newStrategyIdea ? {} : { needsDetails: true }),
          },
        });
      const calendarNote =
        postId === NEW_VIDEO
          ? `Added “${videoName.trim()}” to the calendar on ${uploadDate} and saved ${toSave.length} number${toSave.length === 1 ? "" : "s"}`
          : undefined;
      let copy = null;
      if (alsoOn && post && prefill.fromCalendar) {
        copy = {
          id: uid("post"),
          ...(post.campaignId ? { campaignId: post.campaignId } : {}),
          accountId: alsoOn,
          ...(post.strategyId ? { strategyId: post.strategyId } : {}),
          ...((tacticIds || []).length ? { tacticIds } : {}),
          title: videoName.trim() || post.title,
          format: post.format,
          date: uploadDate,
          status: "executed",
          executedAt: uploadDate,
          readiness: "ready",
          notes: post.notes || "",
          url: "",
          reviewAfterDays: post.reviewAfterDays ?? 7,
        };
        videoOps.push({ op: "upsert", collection: "posts", value: copy });
      }
      await onSaveMany(
        [
        ...videoOps,
        ...toSave.map((r) => ({
          op: "upsert",
          collection: "metrics",
          value: {
            id: uid("metric"),
            accountId: r.accountId,
            kpiId: r.kpiId,
            date: r.date || date,
            value: Number(r.value),
            ...(r.periodDays && Number(r.periodDays) >= 1
              ? { periodDays: Math.round(Number(r.periodDays)) }
              : {}),
            ...(campaignId ? { campaignId } : {}),
            // A video carries its own strategy, so its numbers do not repeat it.
            ...(effStrategyId && !metricPostId ? { strategyId: effStrategyId } : {}),
            ...(metricPostId ? { postId: metricPostId } : {}),
            source: "manual",
          },
        })),
        ],
        copy
          ? `Saved the numbers and copied “${copy.title}” to ${accountOf(alsoOn)?.platform}. Add its numbers next.`
          : calendarNote,
      );
      onClose();
      if (copy) openResults?.(copy);
      if (strategyId === NEW_STRATEGY && detailsNow) openStrategy?.(newStrategyId);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      wide
      title="Add numbers"
      description="Add many numbers at once: several KPIs on one date, or one KPI over many dates. Leave a row empty to skip it."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="scope-choice" role="radiogroup" aria-label="What are these numbers for?">
          <button
            type="button"
            role="radio"
            aria-checked={scope === "account"}
            className={`scope-card ${scope === "account" ? "selected" : ""}`}
            onClick={() => {
              setScope("account");
              setPostId("");
              setStrategyId("");
              // A campaign picked only for choosing a video should not stick to account numbers.
              if (!prefill.campaignId || prefill.postId) setCampaignId("");
            }}
          >
            <strong>Whole channel / account</strong>
            <span>
              Totals for the entire account, like channel views this week or
              total subscribers.
            </span>
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={scope === "post"}
            className={`scope-card ${scope === "post" ? "selected" : ""}`}
            onClick={() => {
              setScope("post");
              setMode("kpis");
            }}
          >
            <strong>One video or post</strong>
            <span>
              Results of a single piece of content, like one video&apos;s views in
              its first week.
            </span>
          </button>
        </div>
        <div className="segmented" style={{ marginBottom: 16 }}>
          <button
            type="button"
            className={mode === "dates" ? "selected" : ""}
            onClick={() => setMode("dates")}
          >
            One KPI, many dates
          </button>
          <button
            type="button"
            className={mode === "kpis" ? "selected" : ""}
            onClick={() => setMode("kpis")}
          >
            Many KPIs, one date
          </button>
        </div>
        <div className="form-grid">
          <Field
            label="Account"
            hint="Every number below is saved to this account."
          >
            <select value={curAccountId} onChange={(e) => switchAccount(e.target.value)}>
              {accountOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.handle} · {a.platform}
                </option>
              ))}
            </select>
          </Field>
          {scope === "post" && (
                <Field
                  label="Video or post"
                  hint={
                    post
                      ? "Numbers are saved to this video."
                      : "First choose which video or post these numbers are for."
                  }
                >
                  <select value={postId} onChange={(e) => choosePost(e.target.value)}>
                    <option value="" disabled>
                      Choose a video or post…
                    </option>
                    <option value={NEW_VIDEO}>+ New video / post…</option>
                    {accountPosts.length > 0 && (
                      <optgroup label="Videos and posts on this account">
                        {accountPosts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title} · {niceDate(p.executedAt || p.date, { month: "short", day: "numeric", year: "numeric" })}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </Field>
          )}
          {mode === "kpis" && scope !== "post" && (
            <Field
              label="Type of number"
              hint="Applies to every row. Totals as of the date (like total subscribers) or what happened over a window (like views over 7 days). Change a single row if it differs."
            >
              <PeriodSelect
                value={sharedPeriod}
                onChange={(v) => {
                  setSharedPeriod(v);
                }}
              />
            </Field>
          )}
          {mode === "kpis" && scope !== "post" && (
            <Field
              label="Data collected on"
              hint="One date for every row below. For weekly or monthly numbers, use the last day of the period."
            >
              <input
                type="date"
                required
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          )}
          <Field
            label="Campaign (optional)"
            hint={
              scope === "post"
                ? post
                  ? "Taken from the video."
                  : "Pick one, or leave on No campaign if it is not part of one."
                : "Optional. Leave as Whole account unless these numbers belong to one campaign."
            }
          >
            <select
              value={campaignId}
              disabled={scope === "post" && Boolean(post)}
              onChange={(e) => chooseCampaign(e.target.value)}
            >
              <option value="">{scope === "post" ? "No campaign" : "Whole account"}</option>
              {campaignOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          {scope === "post" && (
            <>
              <Field
                label="Strategy (the bigger approach, optional)"
                hint="The overall approach this video is part of. Choose none, pick one of yours or a suggestion, add a new one, or add it later (you will be reminded). Specific choices go under Tactics below."
              >
                <select
                  value={strategyLater ? "__later__" : strategyId}
                  onChange={(e) => {
                    const v = e.target.value;
                    setStrategyLater(v === "__later__");
                    setNewStrategyIdea("");
                    if (v === "__later__") {
                      setStrategyId("");
                      return;
                    }
                    if (v.startsWith("__suggest__")) {
                      const idea = SUGGESTED_STRATEGIES[Number(v.slice(11))];
                      setStrategyId(NEW_STRATEGY);
                      setNewStrategyName(idea.name);
                      setNewStrategyIdea(idea.hypothesis);
                      return;
                    }
                    setStrategyId(v);
                  }}
                >
                  <option value="">None</option>
                  <option value="__later__">Add later (remind me)</option>
                  {strategyOptions.length > 0 && (
                    <optgroup label="Your strategies">
                      {strategyOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <option value={NEW_STRATEGY}>+ New strategy…</option>
                  <optgroup label="Suggested strategies">
                    {SUGGESTED_STRATEGIES.map((s, i) =>
                      state.strategies.some(
                        (x) => x.name.toLowerCase() === s.name.toLowerCase(),
                      ) ? null : (
                        <option key={s.name} value={`__suggest__${i}`}>
                          {s.name}
                        </option>
                      ),
                    )}
                  </optgroup>
                </select>
              </Field>
              {strategyId === NEW_STRATEGY && (
                <div className="span-2 video-block">
                  {!campaignId && (
                    <Field
                      label="Campaign for the new strategy"
                      hint="Strategies belong to a campaign. The video itself can stay out of one."
                    >
                      <select
                        value={newStrategyCampaign}
                        onChange={(e) => setNewStrategyCampaign(e.target.value)}
                      >
                        <option value="">Choose a campaign…</option>
                        {campaignOptions.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </Field>
                  )}
                  <Field label="New strategy name">
                    <input
                      autoFocus
                      value={newStrategyName}
                      placeholder="e.g. Face on thumbnail"
                      onChange={(e) => setNewStrategyName(e.target.value)}
                    />
                  </Field>
                  <label className="wizard-toggle" style={{ marginTop: 8 }}>
                    <input
                      type="checkbox"
                      checked={detailsNow}
                      onChange={(e) => setDetailsNow(e.target.checked)}
                    />
                    <span>
                      <strong>Fill in the details right after saving</strong>
                      <small>
                        Leave this off to add details later. The strategy is saved with
                        just its name and you will be reminded to explain it.
                      </small>
                    </span>
                  </label>
                </div>
              )}
              {(
                <div className="span-2">
                  <Field label="Tactics used (optional, several allowed)" wide>
                    <TacticPicker
                      state={state}
                      value={tacticIds}
                      onChange={setTacticIds}
                      pending={pendingTactics}
                      setPending={setPendingTactics}
                      later={tacticsLater}
                      setLater={setTacticsLater}
                    />
                  </Field>
                </div>
              )}
              {(
                <div className="span-2 video-block">
                  <h4>
                    {postId === NEW_VIDEO
                      ? "New video"
                      : postId
                        ? "This video"
                        : "Video details"}
                  </h4>
                  {!postId && (
                    <p className="muted small">
                      Choose a video above, or create a new one, then fill in its details.
                    </p>
                  )}
                  <div className="form-grid">
                    <Field label="Video name">
                      <input
                        value={videoName}
                        placeholder="Name of the YouTube video"
                        onChange={(e) => setVideoName(e.target.value)}
                      />
                    </Field>
                    <Field
                      label="Uploaded on (required)"
                      hint="The day the video went live. This puts it on the calendar."
                    >
                      <input
                        type="date"
                        max={today()}
                        value={uploadDate}
                        onChange={(e) => changeUpload(e.target.value)}
                      />
                    </Field>
                    {mode === "kpis" && (
                      <>
                        <Field
                          label="Days after upload"
                          hint={
                            uploadDate &&
                            addDays(uploadDate, Number(daysAfter) || 0) > today()
                              ? `That date is in the future, so Data collected on is held at today (${gap(uploadDate, today())} days after upload).`
                              : "How long after the upload you collected these numbers."
                          }
                        >
                          <input
                            type="number"
                            min="0"
                            max="3650"
                            value={daysAfter}
                            onChange={(e) => changeDaysAfter(e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Data collected on"
                          hint="Different from the upload date. Edit either one."
                        >
                          <input
                            type="date"
                            max={today()}
                            value={date}
                            onChange={(e) => changeCollected(e.target.value)}
                          />
                        </Field>
                        <Field
                          label="Type of number"
                          hint="Applies to every row. A total as of the date (like views so far) or what happened over a window (like views over 7 days). Change a single row if it differs."
                        >
                          <PeriodSelect
                            value={sharedPeriod}
                            onChange={(v) => setSharedPeriod(v)}
                          />
                        </Field>
                      </>
                    )}
                  </div>
                </div>
              )}
              {prefill.fromCalendar && post && (
                <div className="span-2">
                  <Field
                    label="Same video on another platform (optional)"
                    hint="Posted this video or reel elsewhere too? After saving, a copy is made for that platform and its numbers form opens so you can record them separately."
                  >
                    <select value={alsoOn} onChange={(e) => setAlsoOn(e.target.value)}>
                      <option value="">No, just this platform</option>
                      {state.accounts
                        .filter((a) => a.clientId === accountOf(post.accountId)?.clientId && a.id !== post.accountId)
                        .map((a) => (
                          <option key={a.id} value={a.id}>
                            Copy to {a.handle} · {a.platform}
                          </option>
                        ))}
                    </select>
                  </Field>
                </div>
              )}
            </>
          )}
        </div>

        {mode === "dates" && (
          <div className="batch-rows">
            <div className="form-grid">
              <Field label="KPI">
                <select
                  value={series.kpiId}
                  onChange={(e) => setSeries({ ...series, kpiId: e.target.value })}
                >
                  {(accountOf(series.accountId)?.kpis || []).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} {k.unit ? `(${k.unit})` : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label="Type of number"
                hint="Weekly or monthly figures? Choose the window so each date means the period ending that day."
                wide
              >
                <PeriodSelect
                  value={series.periodDays}
                  onChange={(v) => setSeries({ ...series, periodDays: v })}
                />
              </Field>
            </div>
            <div
              className="batch-head series-head"
              style={uploadDate ? { gridTemplateColumns: "minmax(0,1fr) 120px minmax(0,1fr) 36px" } : undefined}
            >
              <span>Date</span>
              {uploadDate && <span>Days after upload</span>}
              <span>Value</span>
              <span />
            </div>
            {seriesRows.map((r) => (
              <div
                className="batch-row series-row"
                key={r.key}
                style={uploadDate ? { gridTemplateColumns: "minmax(0,1fr) 120px minmax(0,1fr) 36px" } : undefined}
              >
                <input
                  type="date"
                  aria-label="Date"
                  data-row={r.key}
                  onPaste={pasteInto("date")}
                  max={today()}
                  value={r.date}
                  onChange={(e) =>
                    setSeriesRows((l) =>
                      l.map((x) => (x.key === r.key ? { ...x, date: e.target.value } : x)),
                    )
                  }
                />
                {uploadDate && (
                  <input
                    type="number"
                    min="0"
                    aria-label="Days after upload"
                    value={r.date ? gap(uploadDate, r.date) : ""}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      if (e.target.value === "" || !(n >= 0)) return;
                      setSeriesRows((l) =>
                        l.map((x) =>
                          x.key === r.key
                            ? { ...x, date: capToday(addDays(uploadDate, n)) }
                            : x,
                        ),
                      );
                    }}
                  />
                )}
                <NumInput
                  unit={seriesUnit}
                  aria-label="Value"
                  data-row={r.key}
                  onPaste={pasteInto("value")}
                  placeholder="Value"
                  value={r.value}
                  onChange={(e) =>
                    setSeriesRows((l) =>
                      l.map((x) => (x.key === r.key ? { ...x, value: e.target.value } : x)),
                    )
                  }
                />
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="Remove row"
                  disabled={seriesRows.length === 1}
                  onClick={() => setSeriesRows((l) => l.filter((x) => x.key !== r.key))}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <div className="batch-actions">
              <button type="button" className="btn secondary small" onClick={addSeriesRow}>
                <Plus size={14} /> Add another date
              </button>
            </div>
            <div className="paste-lists">
              <h4>Copying from a table? Paste each column separately</h4>
              <p className="muted small">
                Copy the dates column and paste it on the left, copy the values
                column and paste it on the right. Line 1 of each goes together,
                line 2 of each, and so on. You can also click a Date or Value
                cell above and paste a whole column straight into it.
              </p>
              <div className="form-grid">
                <Field label="Dates (one per line)">
                  <textarea
                    rows={6}
                    value={pasteDates}
                    placeholder={"07/03/2026\n14/03/2026\n21/03/2026"}
                    onChange={(e) => setPasteDates(e.target.value)}
                  />
                </Field>
                <Field label="Values (one per line)">
                  <textarea
                    rows={6}
                    value={pasteValues}
                    placeholder={"1,200\n1,350\n1,410"}
                    onChange={(e) => setPasteValues(e.target.value)}
                  />
                </Field>
              </div>
              <div className="batch-actions">
                <button
                  type="button"
                  className="btn secondary small"
                  disabled={!pasteDates.trim() && !pasteValues.trim()}
                  onClick={fillFromLists}
                >
                  Match them up and add to the table
                </button>
              </div>
            </div>
          </div>
        )}

        {mode === "kpis" && (
        <div className="batch-rows">
          <div className="batch-head">
            <span>Measure</span>
            <span>Value</span>
            <span />
            <span />
          </div>
          {rows.map((r) => {
            const account = accountOf(r.accountId);
            const kpi = account?.kpis.find((k) => k.id === r.kpiId);
            return (
              <div className="batch-row" key={r.key}>
                <select
                  aria-label="Measure"
                  value={r.kpiId}
                  onChange={(e) => setRow(r.key, { kpiId: e.target.value })}
                >
                  {(account?.kpis || []).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name} {k.unit ? `(${k.unit})` : ""}
                    </option>
                  ))}
                </select>
                <NumInput
                  unit={kpi?.unit}
                  aria-label={`${kpi?.name || "Value"}`}
                  placeholder={kpi?.unit === "%" ? "e.g. 4.5" : "Value"}
                  value={r.value}
                  onChange={(e) => setRow(r.key, { value: e.target.value })}
                />
                {r.periodDays === undefined ? (
                  <span className="muted small row-type">
                    Same type{" "}
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => setRow(r.key, { periodDays: sharedPeriod })}
                    >
                      Change
                    </button>
                  </span>
                ) : (
                  <div className="period-cell">
                    <PeriodSelect
                      aria-label="Type of number for this row"
                      value={r.periodDays}
                      onChange={(v) => setRow(r.key, { periodDays: v })}
                    />
                    <button
                      type="button"
                      className="text-btn"
                      onClick={() => {
                        const { periodDays: _p, ...rest } = r;
                        setRows((list) => list.map((x) => (x.key === r.key ? rest : x)));
                      }}
                    >
                      Use the same as above
                    </button>
                  </div>
                )}
                <button
                  type="button"
                  className="icon-btn danger"
                  aria-label="Remove row"
                  disabled={rows.length === 1}
                  onClick={() =>
                    setRows((list) => list.filter((x) => x.key !== r.key))
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
          <div className="batch-actions">
            <button type="button" className="btn secondary small" onClick={addRow}>
              <Plus size={14} /> Add another row
            </button>
            {rows[0] && accountOf(rows[0].accountId)?.kpis.length > 1 && (
              <button
                type="button"
                className="btn ghost small"
                onClick={() => addAllFor(rows.at(-1).accountId)}
              >
                Add every measure for this account
              </button>
            )}
          </div>
        </div>

        )}

        <div className="notice scope-note" style={{ marginTop: 16 }}>
          <Info size={17} />
          <span>
            {scope === "post" && !postId ? (
              <>
                <strong>Saving numbers for one video or post.</strong> Pick the video
                above (or create a new one). These stay separate from the account
                totals, growth charts and goals.
              </>
            ) : scope === "post" && postId ? (
              <>
                <strong>Saving results for one video:</strong> “{videoName || "new video"}”. These
                are kept separate from the whole-account numbers, so they never
                change the channel totals or goal progress.
              </>
            ) : (
              <>
                <strong>Saving whole-channel / whole-account numbers.</strong> These
                feed the account totals, growth charts and campaign goals. To record
                one video, switch the choice at the top to “One video or post”.
              </>
            )}
          </span>
        </div>
        <div className="notice" style={{ marginTop: 16 }}>
          <Info size={17} />
          <span>
            Numbers linked to a post or strategy are used to compare what worked.
            Running totals with no post or strategy count toward a campaign&apos;s
            goal progress. Choose “Over 7 days” for things like weekly
            channel views or a video&apos;s first-week views. For percentages, type 4.5 for 4.5%.
          </span>
        </div>
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-footer">
          <button
            type="button"
            className="btn secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} />
            ) : (
              <Check size={16} />
            )}{" "}
            Save{" "}
            {savingCount > 1 ? `${savingCount} numbers` : "number"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
