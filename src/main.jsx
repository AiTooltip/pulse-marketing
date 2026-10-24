import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
  Radar,
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Plus,
  LayoutDashboard,
  Target,
  CalendarDays,
  Users,
  FlaskConical,
  ClipboardCheck,
  BookOpen,
  Database,
  Sparkles,
  Bell,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Check,
  MoreHorizontal,
  Upload,
  Download,
  TrendingUp,
  Clock,
  CheckCircle2,
  Menu,
  X,
  Settings2,
  FileText,
  ExternalLink,
  Video,
  TriangleAlert,
  RefreshCw,
  Folder,
  Play,
  Pause,
  Filter,
  LoaderCircle,
  Copy,
  Pencil,
  BarChart3,
  Lightbulb,
} from "lucide-react";
import {
  today,
  addDays,
  goalProgress,
  notifications,
  strategyPerformance,
} from "../shared/domain.mjs";
import {
  Badge,
  Platform,
  Avatar,
  Empty,
  PanelHeader,
  Sparkline,
  TrendChart,
  ProgressRing,
  Dialog,
  Field,
  StatCard,
  PostCard,
  ClaudePrompt,
  fmt,
  windowLabel,
  PeriodSelect,
  niceDate,
  uid,
  titleCase,
  clamp,
  statusLabel,
  readinessLabel,
} from "./components.jsx";
import EntityForm, { newGoal } from "./Forms.jsx";
import ImportPanel from "./ImportPanel.jsx";
import { ReviewsView, PracticesView } from "./ReviewViews.jsx";
import { Strategies, StrategyCard } from "./StrategyLab.jsx";
import Onboarding from "./Onboarding.jsx";
import BeforeAfter from "./BeforeAfter.jsx";
import Analysis from "./Analysis.jsx";
import TacticsPage from "./Tactics.jsx";
import AccountDetail from "./AccountDetail.jsx";
import TestIdea from "./TestIdea.jsx";
import TasksPanel, { reminderClientId } from "./Tasks.jsx";
import CompetitorsPage from "./Competitors.jsx";
import "./styles.css";
// Grouped by job: what needs doing, planning the work, learning from it, data.
const NAV_GROUPS = [
  [
    null,
    [
      ["overview", "Overview", LayoutDashboard],
      ["reviews", "Assessments", ClipboardCheck],
    ],
  ],
  [
    "Plan",
    [
      ["campaigns", "Campaigns", Target],
      ["calendar", "Content calendar", CalendarDays],
      ["accounts", "Social accounts", Users],
    ],
  ],
  [
    "Learn",
    [
      ["analysis", "Analysis", BarChart3],
      ["tactics", "Tactics lab", Lightbulb],
      ["competitors", "Competitors", Radar],
      ["practices", "Best practices", BookOpen],
    ],
  ],
  ["Data", [["imports", "Data & imports", Database]]],
];
const NAV = NAV_GROUPS.flatMap(([, items]) => items);
// Page names as shown in the breadcrumb and browser tab.
const PAGE_TITLE = {
  overview: "Overview",
  reviews: "Assessments & reminders",
  campaigns: "Campaigns & strategies",
  calendar: "Content calendar",
  accounts: "Social accounts",
  analysis: "Analysis",
  tactics: "Tactics lab",
  competitors: "Competitor analysis",
  practices: "Best practices",
  imports: "Data & imports",
};
/** Read the page from the address bar so refresh and Back keep your place. */
function readRoute() {
  const [head = "", id] = window.location.hash.replace(/^#\/?/, "").split("/");
  if (head === "strategies")
    return { page: "campaigns", section: "strategies", campaign: null };
  if (head === "campaign" && id)
    return {
      page: "campaigns",
      section: "campaigns",
      campaign: decodeURIComponent(id),
    };
  return {
    page: PAGE_TITLE[head] ? head : "overview",
    section: "campaigns",
    campaign: null,
  };
}
function routeHash(page, section, campaign) {
  if (page !== "campaigns") return `#/${page}`;
  if (campaign) return `#/campaign/${encodeURIComponent(campaign)}`;
  return section === "strategies" ? "#/strategies" : "#/campaigns";
}
const savedClient = () => {
  try {
    return localStorage.getItem("pulse.client") || "all";
  } catch {
    return "all";
  }
};
const STATUS_TONE = {
  active: "green",
  planned: "neutral",
  paused: "amber",
  completed: "purple",
  promising: "green",
  testing: "purple",
  adopted: "green",
  executed: "green",
  cancelled: "neutral",
  ready: "green",
  needed: "amber",
  "in-progress": "purple",
};
const scoped = (state, clientId) => {
  const clients = state.clients.filter(
    (c) => clientId === "all" || c.id === clientId,
  );
  const ids = new Set(clients.map((c) => c.id));
  const accounts = state.accounts.filter((a) => ids.has(a.clientId));
  const campaigns = state.campaigns.filter((c) => ids.has(c.clientId));
  const cids = new Set(campaigns.map((c) => c.id));
  return {
    clients,
    accounts,
    campaigns,
    strategies: state.strategies.filter((s) => cids.has(s.campaignId)),
    // Posts follow their account, so ones with no campaign are included.
    posts: state.posts.filter((p) => accounts.some((a) => a.id === p.accountId)),
  };
};
async function api(path, body) {
  const res = await fetch(
    path,
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const json = await res.json();
  if (!res.ok)
    throw new Error(
      typeof json.error === "string"
        ? json.error
        : json.error?.message || "Could not save. Please try again.",
    );
  return json;
}
function App() {
  const [state, setState] = useState(null);
  const initialRoute = useRef(readRoute()).current;
  const [page, setPage] = useState(initialRoute.page);
  const [clientId, setClientIdRaw] = useState(savedClient);
  const [modal, setModal] = useState(null);
  const [post, setPost] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [connection, setConnection] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [focusCampaign, setFocusCampaign] = useState(initialRoute.campaign);
  const [campaignSection, setCampaignSection] = useState(initialRoute.section);
  const [stateBusy, setStateBusy] = useState(false);
  const [wizard, setWizard] = useState(false);
  const [idea, setIdea] = useState(null);
  const [calendarMonth, setCalendarMonth] = useState(null);
  const [pendingPost, setPendingPost] = useState(null);
  const toastTimer = useRef();
  const stateRef = useRef();
  stateRef.current = state;
  const refresh = async () => {
    try {
      const s = await api("/api/state");
      setState(s);
      setLoadError("");
      setConnection(true);
    } catch (e) {
      setConnection(false);
      if (!stateRef.current) setLoadError(e.message);
    }
  };
  useEffect(() => {
    refresh();
  }, []);
  useEffect(() => {
    if (modal || stateBusy) return;
    const timer = setInterval(refresh, 5000);
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [!!modal, stateBusy]);
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  useEffect(() => {
    if (!pendingPost || !state) return;
    const found = state.posts.find((p) => p.id === pendingPost);
    if (found) {
      setPost(found);
      setPendingPost(null);
    }
  }, [pendingPost, state]);
  // Keep the address bar in step with the page, and follow Back/Forward.
  useEffect(() => {
    const hash = routeHash(page, campaignSection, focusCampaign);
    if (window.location.hash !== hash) window.history.pushState(null, "", hash);
    const title =
      (page === "campaigns" &&
        focusCampaign &&
        state?.campaigns.find((c) => c.id === focusCampaign)?.name) ||
      PAGE_TITLE[page];
    document.title = `${title} · Pulse`;
  }, [page, campaignSection, focusCampaign, state]);
  useEffect(() => {
    if (!mobile) return;
    const onKey = (e) => e.key === "Escape" && setMobile(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [mobile]);
  useEffect(() => {
    const onPop = () => {
      const r = readRoute();
      setPage(r.page);
      setCampaignSection(r.section);
      setFocusCampaign(r.campaign);
      setMobile(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const setClientId = (id) => {
    setClientIdRaw(id);
    try {
      localStorage.setItem("pulse.client", id);
    } catch {}
  };
  // A remembered client that no longer exists falls back to all clients.
  useEffect(() => {
    if (state && clientId !== "all" && !state.clients.some((c) => c.id === clientId))
      setClientId("all");
  }, [state, clientId]);
  /** `action` is an optional { label, run } shown as a button, e.g. Undo. */
  const notify = (message, type = "success", action = null) => {
    setToast({ message, type, action });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(
      () => setToast(null),
      action || type === "error" ? 9000 : 4500,
    );
  };
  const openForm = (type, value = null, prefill = {}) => {
    const s = stateRef.current;
    if (type === "client" && !value) {
      setPost(null);
      setWizard(true);
      return;
    }
    if (!value) {
      if (["account", "campaign"].includes(type) && !s.clients.length) {
        notify("Start by adding your first client.");
        type = "client";
        prefill = {};
      } else if (
        ["post", "metric", "video"].includes(type) &&
        !s.accounts.length
      ) {
        notify("Add a social account before recording content or metrics.");
        type = s.clients.length ? "account" : "client";
        prefill = {};
      } else if (
        ["post", "strategy", "assessment", "video"].includes(type) &&
        !s.campaigns.length
      ) {
        notify("Create a campaign to organize this work.");
        type = s.clients.length ? "campaign" : "client";
        prefill = {};
      }
    }
    setPost(null);
    setModal({ type, value, prefill, revision: s.revision });
  };
  const mutate = async (collection, value, revision) => {
    setStateBusy(true);
    try {
      const s = await api("/api/mutate", {
        revision: revision || stateRef.current.revision,
        operations: [{ op: "upsert", collection, value }],
      });
      setState(s);
      notify("Saved to your workspace");
      return s;
    } finally {
      setStateBusy(false);
    }
  };
  const mutateMany = async (operations, revision, message) => {
    setStateBusy(true);
    try {
      const s = await api("/api/mutate", {
        revision: revision || stateRef.current.revision,
        operations,
      });
      setState(s);
      notify(
        message ||
          (operations.length === 1
            ? "Saved to your workspace"
            : `Saved ${operations.length} items to your workspace`),
      );
      return s;
    } finally {
      setStateBusy(false);
    }
  };
  const duplicatePost = (p) => {
    const { id, executedAt, url, createdAt, updatedAt, ...copy } = p;
    openForm("post", null, {
      ...copy,
      title: `${p.title} (copy)`,
      status: "planned",
      readiness: "needed",
      date: p.date < today() ? today() : p.date,
      url: "",
      duplicateOf: p.id,
    });
  };
  const safeMutate = async (...args) => {
    try {
      return await mutate(...args);
    } catch (e) {
      notify(e.message, "error");
      return null;
    }
  };
  const remove = async (collection, id) => {
    const s = await api("/api/mutate", {
      revision: modal?.revision || state.revision,
      operations: [{ op: "delete", collection, id }],
    });
    setState(s);
    notify("Record deleted");
  };
  const navigate = (p) => {
    // Strategies now live with campaigns.
    if (p === "strategies") {
      setCampaignSection("strategies");
      p = "campaigns";
    } else if (p === "campaigns") setCampaignSection("campaigns");
    setPage(p);
    setMobile(false);
    setFocusCampaign(null);
    window.scrollTo(0, 0);
  };
  const openCampaign = (c) => {
    if (!c) return;
    setFocusCampaign(c.id);
    setCampaignSection("campaigns");
    setPage("campaigns");
    window.scrollTo(0, 0);
  };
  if (!state)
    return (
      <div className="boot">
        <div className="brand-symbol">
          <Activity />
        </div>
        <h1>Pulse</h1>
        {loadError ? (
          <>
            <p>{loadError}</p>
            <button className="btn primary" onClick={refresh}>
              <RefreshCw size={16} /> Retry connection
            </button>
            <p className="muted">
              Start the app with <code>npm start</code> in the project folder.
            </p>
          </>
        ) : (
          <p className="muted">
            <LoaderCircle size={16} className="spin" /> Opening your workspace…
          </p>
        )}
      </div>
    );
  const data = scoped(state, clientId);
  const due = notifications(state).filter(
    (n) =>
      n.date <= today() &&
      (clientId === "all" ||
        [clientId, undefined].includes(reminderClientId(state, n))),
  ).length;
  const shared = {
    state,
    clientId,
    openForm,
    mutate: safeMutate,
    askClaude: setPrompt,
    duplicatePost,
    notify,
    openPost: setPost,
  };
  const workspaceName = state.settings.workspaceName || "Your workspace";
  const demo = state.metrics.some((m) => m.source === "demo");
  const detailCampaign =
    page === "campaigns" && focusCampaign
      ? state.campaigns.find((c) => c.id === focusCampaign)
      : null;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside
        className={`sidebar ${mobile ? "open" : ""}`}
        aria-label="Main navigation"
      >
        <div className="sidebar-top">
          <a
            className="brand"
            href="#/overview"
            onClick={(e) => {
              e.preventDefault();
              navigate("overview");
            }}
          >
            <span className="brand-symbol">
              <Activity size={22} />
            </span>
            <span>
              pulse<span className="brand-period">.</span>
            </span>
          </a>
          <button
            className="icon-btn sidebar-close"
            onClick={() => setMobile(false)}
            aria-label="Close navigation"
          >
            <X size={20} />
          </button>
        </div>
        <div className="workspace-switch" title={workspaceName}>
          <span className="workspace-avatar" aria-hidden="true">
            {workspaceName.trim().charAt(0).toUpperCase() || "P"}
          </span>
          <div>
            <strong>{workspaceName}</strong>
            <span>
              {state.clients.length}{" "}
              {state.clients.length === 1 ? "client" : "clients"} · saved on
              this computer
            </span>
          </div>
        </div>
        <nav>
          {NAV_GROUPS.map(([group, items]) => (
            <div className="nav-group" key={group || "main"}>
              {group && <div className="nav-label">{group}</div>}
              {items.map(([id, label, Icon]) => (
                <button
                  key={id}
                  className={`nav-item ${page === id ? "active" : ""}`}
                  aria-current={page === id ? "page" : undefined}
                  onClick={() => navigate(id)}
                >
                  <Icon size={18} />
                  <span>{label}</span>
                  {id === "reviews" && due > 0 && (
                    <span
                      className="nav-count"
                      aria-label={`${due} due or overdue`}
                    >
                      {due}
                    </span>
                  )}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="codex-box"
            onClick={() =>
              setPrompt(
                "Review my marketing workspace. Tell me what needs attention today, which strategies have the strongest evidence, and suggest one focused experiment to run next.",
              )
            }
          >
            <Sparkles size={18} />
            <span>
              <strong>Ask Claude</strong>
              <small>Get a briefing on what needs attention</small>
            </span>
          </button>
          <div className="local-status" role="status">
            <span className={`status-dot ${connection ? "" : "offline"}`} />
            <span>
              {connection
                ? "All changes saved on this computer"
                : "Not connected. Changes can’t be saved"}
            </span>
          </div>
        </div>
      </aside>
      {mobile && (
        <div className="sidebar-scrim" onClick={() => setMobile(false)} />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-btn mobile-menu"
              onClick={() => setMobile((v) => !v)}
              aria-label="Open navigation"
              aria-expanded={mobile}
            >
              <Menu size={21} />
            </button>
            <nav aria-label="Breadcrumb">
              {detailCampaign ? (
                <>
                  <button
                    className="crumb-link"
                    onClick={() => navigate("campaigns")}
                  >
                    Campaigns
                  </button>
                  <ChevronRight size={14} aria-hidden="true" />
                  <strong aria-current="page">{detailCampaign.name}</strong>
                </>
              ) : (
                <strong aria-current="page">{PAGE_TITLE[page]}</strong>
              )}
            </nav>
          </div>
          <div className="topbar-actions">
            {demo && (
              <span
                className="local-pill"
                title="Some numbers in this workspace are sample data"
              >
                <span className="status-dot" /> Includes demo data
              </span>
            )}
            <label className="client-switch">
              <Users size={16} aria-hidden="true" />
              <select
                aria-label="Show work for client"
                value={clientId}
                onChange={(e) => {
                  if (e.target.value === "__add") {
                    openForm("client");
                    return;
                  }
                  setClientId(e.target.value);
                  setFocusCampaign(null);
                }}
              >
                <option value="all">
                  All clients ({state.clients.length})
                </option>
                {state.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
                <option disabled>──────────</option>
                <option value="__add">+ Add a client…</option>
              </select>
            </label>
            <button
              className="icon-btn notifications-button"
              onClick={() => navigate("reviews")}
              aria-label={
                due
                  ? `${due} assessments or reminders due — open Assessments`
                  : "Nothing due — open Assessments"
              }
              title={due ? `${due} due or overdue` : "Nothing due today"}
            >
              <Bell size={19} />
              {due > 0 && <span className="bell-count">{due}</span>}
            </button>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          {!connection && (
            <div className="error" role="alert">
              The local server isn’t responding, so changes can’t be saved right
              now. Your last loaded data is shown. Restart it with{" "}
              <code>npm start</code>.
              <button className="btn secondary small" onClick={refresh}>
                <RefreshCw size={14} /> Try again
              </button>
            </div>
          )}
          {page === "overview" && (
            <Overview
              {...shared}
              data={data}
              mutateMany={mutateMany}
              navigate={navigate}
              openCampaign={openCampaign}
              openPost={setPost}
            />
          )}
          {page === "campaigns" && (
            <Campaigns
              {...shared}
              data={data}
              focusCampaign={focusCampaign}
              setFocusCampaign={setFocusCampaign}
              openPost={setPost}
              section={campaignSection}
              setSection={setCampaignSection}
            />
          )}
          {page === "calendar" && (
            <CalendarView
              {...shared}
              data={data}
              openPost={setPost}
              focusMonth={calendarMonth}
            />
          )}
          {page === "accounts" && <Accounts {...shared} data={data} />}
          {page === "analysis" && <Analysis {...shared} data={data} />}
          {page === "competitors" && (
            <CompetitorsPage {...shared} data={data} mutateMany={mutateMany} />
          )}
          {page === "tactics" && (
            <TacticsPage {...shared} data={data} mutateMany={mutateMany} />
          )}
          {page === "reviews" && <ReviewsView {...shared} />}
          {page === "practices" && (
            <PracticesView {...shared} onTestIdea={setIdea} />
          )}
          {page === "imports" && (
            <DataView
              {...shared}
              data={data}
              onState={setState}
              onToast={notify}
              mutateMany={mutateMany}
            />
          )}
        </main>
      </div>
      {modal && (
        <EntityForm
          key={modal.type + (modal.value?.id || "new")}
          modal={modal}
          state={state}
          clientId={clientId}
          onClose={() => {
            setModal(null);
            refresh();
          }}
          onSave={(c, v) => mutate(c, v, modal.revision)}
          onSaveMany={(ops, msg) => mutateMany(ops, modal.revision, msg)}
          onDelete={remove}
          openStrategy={(id) =>
            setTimeout(() => {
              const st = stateRef.current.strategies.find((x) => x.id === id);
              if (st) openForm("strategy", st);
            }, 0)
          }
          openResults={(p) =>
            setTimeout(
              () =>
                openForm("metric", null, {
                  accountId: p.accountId,
                  campaignId: p.campaignId,
                  strategyId: p.strategyId || "",
                  postId: p.id,
                  fromCalendar: true,
                  periodDays: "7",
                  date:
                    addDays(p.executedAt || p.date, 7) > today()
                      ? today()
                      : addDays(p.executedAt || p.date, 7),
                }),
              0,
            )
          }
        />
      )}
      {wizard && (
        <Onboarding
          accounts={state.accounts}
          onClose={() => {
            setWizard(false);
            refresh();
          }}
          onSaveMany={(ops) => mutateMany(ops)}
          onDone={(id) => {
            setClientId(id);
            navigate("accounts");
          }}
        />
      )}
      {idea && (
        <TestIdea
          practice={idea}
          state={state}
          clientId={clientId}
          onClose={() => setIdea(null)}
          onSaveMany={(ops) => mutateMany(ops)}
          onDone={({ postId, date }) => {
            if (date) {
              setCalendarMonth(date.slice(0, 7));
              navigate("calendar");
              if (postId) setPendingPost(postId);
            } else navigate("strategies");
          }}
        />
      )}
      {post && (
        <PostDetail
          post={state.posts.find((p) => p.id === post.id) || post}
          {...shared}
          onClose={() => setPost(null)}
        />
      )}
      {prompt && <ClaudePrompt prompt={prompt} onClose={() => setPrompt("")} />}
      {toast && (
        <div
          className={`toast ${toast.type}`}
          role={toast.type === "error" ? "alert" : "status"}
        >
          {toast.type === "error" ? (
            <TriangleAlert size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{toast.message}</span>
          {toast.action && (
            <button
              className="toast-action"
              onClick={() => {
                setToast(null);
                toast.action.run();
              }}
            >
              {toast.action.label}
            </button>
          )}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
function PageHeading({ title, description, eyebrow, children }) {
  return (
    <div className="page-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        <p className="muted">{description}</p>
      </div>
      <div className="heading-actions">{children}</div>
    </div>
  );
}
function Overview({
  state,
  clientId,
  mutateMany,
  data,
  openForm,
  navigate,
  openCampaign,
  openPost,
  askClaude,
  notify,
}) {
  const goals = data.campaigns
    .filter((c) => c.status === "active")
    .flatMap((c) =>
      c.goals.map((g) => ({
        campaign: c,
        goal: g,
        ...goalProgress(state, c, g),
      })),
    );
  const [selected, setSelected] = useState("");
  const entry = goals.find((g) => g.goal.id === selected) || goals[0];
  const account = state.accounts.find((a) => a.id === entry?.goal.accountId);
  const kpi = account?.kpis.find((k) => k.id === entry?.goal.kpiId);
  const onTrack = goals.filter((g) => g.onTrack && g.hasData).length;
  const avg = goals.length
    ? goals.reduce((a, g) => a + clamp(g.percent), 0) / goals.length
    : 0;
  const upcoming = data.posts
    .filter((p) => p.status === "planned" && p.date >= today())
    .sort((a, b) => a.date.localeCompare(b.date));
  const weekly = upcoming.filter((p) => p.date <= addDays(today(), 7));
  const strategyRank = data.strategies
    .map((s) => ({ ...s, ...strategyPerformance(state, s) }))
    .filter((s) => s.score !== null)
    .sort((a, b) => b.score - a.score);
  const earliest = data.campaigns
    .filter((c) => c.status === "active")
    .sort((a, b) => a.endDate.localeCompare(b.endDate));
  return (
    <>
      <PageHeading
        title="Overview"
        description={`${niceDate(today(), { weekday: "long", month: "long", day: "numeric" })} · How your goals are moving and what to do next.`}
      >
        <button className="btn secondary" onClick={() => navigate("imports")}>
          <Upload size={16} /> Import numbers
        </button>
        <button className="btn primary" onClick={() => openForm("campaign")}>
          <Plus size={17} /> New campaign
        </button>
      </PageHeading>
      <div className="stat-grid">
        <StatCard
          icon={Target}
          label="Active campaigns"
          value={data.campaigns.filter((c) => c.status === "active").length}
          onClick={() => navigate("campaigns")}
          sub={
            <>
              <span>
                {data.clients.length}{" "}
                {data.clients.length === 1 ? "client" : "clients"}
              </span>
              <span>
                {data.accounts.length}{" "}
                {data.accounts.length === 1 ? "account" : "accounts"}
              </span>
            </>
          }
        />
        <StatCard
          icon={TrendingUp}
          label="Goals on track"
          value={`${onTrack} of ${goals.length}`}
          onClick={() => navigate("campaigns")}
          sub={
            <>
              <span className="green-text">
                {Math.round(avg)}% of the way, on average
              </span>
            </>
          }
        />
        <StatCard
          icon={CalendarDays}
          label="Posts due in 7 days"
          value={weekly.length}
          onClick={() => navigate("calendar")}
          sub={
            weekly.length ? (
              <>
                <span className="green-text">
                  {weekly.filter((p) => p.readiness === "ready").length} ready
                </span>
                <span
                  className={
                    weekly.some((p) => p.readiness === "needed")
                      ? "amber-text"
                      : ""
                  }
                >
                  {weekly.filter((p) => p.readiness !== "ready").length} to
                  prepare
                </span>
              </>
            ) : (
              <span>Nothing scheduled</span>
            )
          }
        />
        <StatCard
          icon={FlaskConical}
          label="Strategies being tested"
          value={data.strategies.filter((s) => s.status !== "paused").length}
          onClick={() => navigate("strategies")}
          sub={
            <span className="purple-text">
              {data.strategies.filter((s) => s.status === "promising").length}{" "}
              marked promising
            </span>
          }
          color="#a08bbc"
        />
      </div>
      <TasksPanel
        state={state}
        clientId={clientId}
        mutateMany={mutateMany}
        navigate={navigate}
        openForm={openForm}
        openPost={openPost}
        notify={notify}
      />
      <div className="overview-middle">
        <section className="panel trend-panel">
          <PanelHeader
            title="How a goal is moving"
            description="The line shows each number you recorded. The dashed line is your target."
            action={
              <span className="chart-key">
                <i /> Recorded <i className="target-key" /> Target
              </span>
            }
          />
          <div className="chart-toolbar">
            <div className="chart-kpi">
              <strong>{entry ? fmt(entry.current, kpi?.unit) : "—"}</strong>
              <span>{kpi?.name || "No metric selected"}</span>
              {entry && (
                <Badge tone="green">{Math.round(entry.percent)}% of goal</Badge>
              )}
            </div>
            <select
              className="chart-select"
              aria-label="Chart metric"
              value={entry?.goal.id || ""}
              onChange={(e) => setSelected(e.target.value)}
            >
              {goals.map((g) => {
                const a = state.accounts.find((a) => a.id === g.goal.accountId);
                return (
                  <option key={g.goal.id} value={g.goal.id}>
                    {a?.handle} · {a?.platform} ·{" "}
                    {a?.kpis.find((k) => k.id === g.goal.kpiId)?.name}
                    {g.goal.periodDays
                      ? ` · ${windowLabel(g.goal.periodDays)}`
                      : ""}
                  </option>
                );
              })}
            </select>
          </div>
          <TrendChart
            history={entry?.history || []}
            target={entry?.goal.target}
            unit={kpi?.unit}
            height={246}
          />
          <div className="chart-caption">
            <span>
              {entry?.campaign.name || "Add a campaign goal to begin"}
            </span>
            <button
              onClick={() =>
                openForm(
                  "metric",
                  null,
                  entry
                    ? {
                        accountId: account.id,
                        kpiId: kpi.id,
                        campaignId: entry.campaign.id,
                      }
                    : {},
                )
              }
            >
              Add numbers <Plus size={13} />
            </button>
          </div>
        </section>
        <section className="panel pulse-panel">
          <PanelHeader
            title="Goal progress"
            action={<Activity size={18} className="muted" />}
          />
          <div className="pulse-ring">
            <ProgressRing
              value={avg}
              size={158}
              label={
                <>
                  <b>
                    {Math.round(avg)}
                    <small>%</small>
                  </b>
                  <em>of the way to goals</em>
                </>
              }
            />
          </div>
          <div className="pulse-legend">
            <div>
              <span>
                <i className="legend-dot green" />
                On track
              </span>
              <strong>{onTrack} goals</strong>
            </div>
            <div>
              <span>
                <i className="legend-dot amber" />
                Behind pace
              </span>
              <strong>
                {goals.filter((g) => g.hasData && !g.onTrack).length} goals
              </strong>
            </div>
            <div>
              <span>
                <i className="legend-dot gray" />
                No data yet
              </span>
              <strong>{goals.filter((g) => !g.hasData).length} goals</strong>
            </div>
          </div>
          <button className="panel-link" onClick={() => navigate("campaigns")}>
            See all campaigns <ArrowRight size={16} />
          </button>
        </section>
      </div>
      <section className="campaign-strip">
        <div className="section-label">
          <h2>
            Campaigns in motion <span>{earliest.length}</span>
          </h2>
          <button className="text-btn" onClick={() => navigate("campaigns")}>
            View all campaigns <ArrowRight size={15} />
          </button>
        </div>
        <div className="campaign-mini-grid">
          {earliest.slice(0, 3).map((c) => (
            <CampaignMini
              key={c.id}
              campaign={c}
              state={state}
              onClick={() => openCampaign(c)}
            />
          ))}
          {!earliest.length && (
            <Empty
              title="No active campaigns"
              description="Create a campaign to set goals and follow your progress."
              action={
                <button
                  className="btn primary"
                  onClick={() => openForm("campaign")}
                >
                  New campaign
                </button>
              }
            />
          )}
        </div>
      </section>
      <div className="overview-bottom">
        <section className="panel">
          <PanelHeader
            title="Best-performing strategies"
            description="Ranked by how far their results have moved your campaign goals."
            action={
              <button
                className="icon-btn"
                aria-label="Open strategies"
                onClick={() => navigate("strategies")}
              >
                <ArrowUpRight size={19} />
              </button>
            }
          />
          <div className="strategy-ranking">
            {strategyRank.slice(0, 3).map((s, i) => (
              <button
                key={s.id}
                className="rank-row"
                onClick={() => openForm("strategy", s)}
              >
                <span className={`rank-number n${i}`}>0{i + 1}</span>
                <div className="rank-info">
                  <strong>{s.name}</strong>
                  <span>
                    {
                      state.clients.find(
                        (c) =>
                          c.id ===
                          state.campaigns.find((c) => c.id === s.campaignId)
                            ?.clientId,
                      )?.name
                    }{" "}
                    · {s.samples}{" "}
                    {s.samples === 1 ? "result" : "results"} recorded
                  </span>
                </div>
                <div className="rank-value">
                  <strong>{Math.round(s.score)}%</strong>
                  <span>of the way to goals</span>
                </div>
                <ArrowUpRight size={16} />
              </button>
            ))}
            {!strategyRank.length && (
              <Empty
                icon={FlaskConical}
                title="Nothing to rank yet"
                description="Record results for a post that belongs to a strategy, and the best performers will show up here."
                action={
                  <button
                    className="btn secondary"
                    onClick={() => navigate("calendar")}
                  >
                    Open the calendar
                  </button>
                }
              />
            )}
          </div>
          {strategyRank.length > 0 && (
          <button
            className="insight-callout"
            onClick={() =>
              askClaude(
                "Analyze my best-performing strategies using the metrics and assessments in this workspace. Explain possible reasons, note confounding variables and sample size, then save an evidence-backed best practice and propose a controlled next test.",
              )
            }
          >
            <span className="insight-icon">
              <Sparkles size={18} />
            </span>
            <div>
              <strong>Ask Claude why these worked</strong>
              <span>Get a written analysis and a next test</span>
            </div>
            <ArrowUpRight size={17} />
          </button>
          )}
        </section>
        <section className="panel">
          <PanelHeader
            title="Coming up"
            action={
              <button className="text-btn" onClick={() => navigate("calendar")}>
                View calendar <ArrowRight size={14} />
              </button>
            }
          />
          <div className="upcoming-list">
            {upcoming.slice(0, 4).map((p) => {
              const a = state.accounts.find((a) => a.id === p.accountId);
              return (
                <button
                  key={p.id}
                  className="upcoming-row"
                  onClick={() => openPost(p)}
                >
                  <div
                    className={`date-tile ${p.date === today() ? "is-today" : ""}`}
                  >
                    <strong>{new Date(p.date + "T12:00:00").getDate()}</strong>
                    <span>{niceDate(p.date, { month: "short" })}</span>
                  </div>
                  <div className="upcoming-info">
                    <strong>{p.title}</strong>
                    <span>
                      <Platform platform={a?.platform} size={12} />
                      {
                        state.clients.find((c) => c.id === a?.clientId)?.name
                      }{" "}
                      <b>·</b> {p.format}
                    </span>
                  </div>
                  <Badge tone={STATUS_TONE[p.readiness]}>
                    {readinessLabel(p.readiness)}
                  </Badge>
                </button>
              );
            })}
            {!upcoming.length && (
              <Empty
                icon={CalendarDays}
                title="No posts planned yet"
                description="Add post ideas to the calendar so you can see what is coming up."
                action={
                  <button
                    className="btn secondary"
                    onClick={() => openForm("post")}
                  >
                    Plan content
                  </button>
                }
              />
            )}
          </div>
        </section>
      </div>
    </>
  );
}
function PostActions({ post, openForm, duplicatePost }) {
  return (
    <div className="post-actions">
      <button
        className="btn ghost small"
        onClick={() => openForm("post", post)}
        aria-label={`Edit ${post.title}`}
      >
        <Pencil size={13} /> Edit
      </button>
      <button
        className="btn ghost small"
        onClick={() => duplicatePost(post)}
        aria-label={`Duplicate ${post.title}`}
      >
        <Copy size={13} /> Duplicate
      </button>
    </div>
  );
}
function CampaignMini({ campaign: c, state, onClick }) {
  const client = state.clients.find((x) => x.id === c.clientId);
  const values = c.goals.map((g) => goalProgress(state, c, g));
  const progress = values.length
    ? values.reduce((sum, g) => sum + clamp(g.percent), 0) / values.length
    : 0;
  return (
    <button className="campaign-mini" onClick={onClick}>
      <div className="campaign-mini-top">
        <Avatar client={client} />
        <span>{client?.name}</span>
        <Badge tone={STATUS_TONE[c.status]}>{statusLabel(c.status)}</Badge>
      </div>
      <div className="campaign-mini-body">
        <div>
          <h3>{c.name}</h3>
          <span>
            {niceDate(c.startDate)} — {niceDate(c.endDate)}
          </span>
        </div>
        <ProgressRing value={progress} size={58} />
      </div>
      <div className="campaign-mini-foot">
        <span>
          {c.goals.length} goal{c.goals.length === 1 ? "" : "s"}
        </span>
        <span>
          {values.some((g) => g.hasData && !g.onTrack) ? (
            <>
              <span className="amber-dot" />
              Needs attention
            </>
          ) : values.length ? (
            <>
              <span className="ready-dot" />
              In progress
            </>
          ) : (
            "Set your targets"
          )}
        </span>
      </div>
    </button>
  );
}
function Campaigns({
  state,
  data,
  focusCampaign,
  setFocusCampaign,
  openForm,
  openPost,
  askClaude,
  mutate,
  duplicatePost,
  section = "campaigns",
  setSection = () => {},
}) {
  const [filter, setFilter] = useState("all");
  const campaign = data.campaigns.find((c) => c.id === focusCampaign);
  if (campaign)
    return (
      <CampaignDetail
        state={state}
        campaign={campaign}
        onBack={() => setFocusCampaign(null)}
        openForm={openForm}
        openPost={openPost}
        askClaude={askClaude}
        mutate={mutate}
        duplicatePost={duplicatePost}
      />
    );
  return (
    <>
      <PageHeading
        title="Campaigns & strategies"
        description="A campaign is a time-boxed push with goals. Strategies are the approaches you test inside it."
      >
        <button
          className="btn primary"
          onClick={() =>
            openForm(section === "strategies" ? "strategy" : "campaign")
          }
        >
          <Plus size={16} />{" "}
          {section === "strategies" ? "New strategy" : "New campaign"}
        </button>
      </PageHeading>
      <div className="tabs" role="tablist" aria-label="Campaigns or strategies">
        <button
          role="tab"
          aria-selected={section === "campaigns"}
          className={section === "campaigns" ? "selected" : ""}
          onClick={() => setSection("campaigns")}
        >
          Campaigns <span>{data.campaigns.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={section === "strategies"}
          className={section === "strategies" ? "selected" : ""}
          onClick={() => setSection("strategies")}
        >
          Strategies <span>{data.strategies.length}</span>
        </button>
      </div>
      <details className="level-guide-details">
        <summary>How campaigns, strategies and tactics fit together</summary>
        <div className="level-guide">
          <div className={section === "campaigns" ? "current" : ""}>
            <strong>Campaign</strong>
            <span>
              A time-boxed push with goals, like “reach 5,000 followers by 30
              June”.
            </span>
          </div>
          <div className={section === "strategies" ? "current" : ""}>
            <strong>Strategy</strong>
            <span>
              The overall approach you use inside a campaign. It changes
              rarely.
            </span>
          </div>
          <div>
            <strong>Tactic</strong>
            <span>
              A specific choice in one video, tested one by one in the Tactics
              lab.
            </span>
          </div>
        </div>
      </details>
      {section === "strategies" ? (
        <Strategies
          state={state}
          data={data}
          openForm={openForm}
          askClaude={askClaude}
          mutate={mutate}
          openPost={openPost}
          embedded
        />
      ) : (
        <>
      <div className="filter-chips" aria-label="Filter campaigns by status">
        {["all", "active", "planned", "paused", "completed"].map((s) => {
          const n = data.campaigns.filter(
            (c) => s === "all" || c.status === s,
          ).length;
          if (!n && s !== "all" && filter !== s) return null;
          return (
            <button
              key={s}
              aria-pressed={filter === s}
              className={filter === s ? "selected" : ""}
              onClick={() => setFilter(s)}
            >
              {s === "all" ? "All" : statusLabel(s)} <span>{n}</span>
            </button>
          );
        })}
      </div>
      <div className="cards-grid campaigns-grid">
        {data.campaigns
          .filter((c) => filter === "all" || c.status === filter)
          .map((c) => (
            <CampaignMini
              key={c.id}
              campaign={c}
              state={state}
              onClick={() => setFocusCampaign(c.id)}
            />
          ))}
      </div>
      {!data.campaigns.some((c) => filter === "all" || c.status === filter) && (
        <Empty
          icon={Target}
          title="No campaigns here yet"
          description="Create one with an objective, dates and the numbers you want to move."
          action={
            <button
              className="btn primary"
              onClick={() => openForm("campaign")}
            >
              Create a campaign
            </button>
          }
        />
      )}
        </>
      )}
    </>
  );
}
function CampaignDetail({
  state,
  campaign: c,
  onBack,
  openForm,
  openPost,
  askClaude,
  mutate,
  duplicatePost,
}) {
  const client = state.clients.find((x) => x.id === c.clientId);
  const strategies = state.strategies.filter((s) => s.campaignId === c.id);
  const posts = state.posts.filter((p) => p.campaignId === c.id);
  return (
    <>
      <button className="text-btn back-link" onClick={onBack}>
        <ArrowLeft size={15} /> All campaigns
      </button>
      <PageHeading
        title={c.name}
        description={c.objective}
        eyebrow={client?.name}
      >
        <button
          className="btn secondary"
          onClick={() => openForm("campaign", c)}
        >
          <Settings2 size={16} /> Edit campaign
        </button>
        <button
          className="btn primary"
          onClick={() =>
            openForm("assessment", null, {
              entityType: "campaign",
              entityId: c.id,
            })
          }
        >
          <ClipboardCheck size={16} /> Write assessment
        </button>
      </PageHeading>
      <div className="campaign-meta">
        <Badge tone={STATUS_TONE[c.status]}>{statusLabel(c.status)}</Badge>
        <span>
          <CalendarDays size={16} />
          {niceDate(c.startDate)} — {niceDate(c.endDate)}
        </span>
        <span>
          <Clock size={16} />
          Assessed every {c.reviewEveryDays} days
        </span>
        <span>
          Next assessment:{" "}
          <strong
            className={
              c.nextReviewDate < today()
                ? "warn-text"
                : c.nextReviewDate === today()
                  ? "amber-text"
                  : ""
            }
          >
            {c.nextReviewDate < today()
              ? `overdue since ${niceDate(c.nextReviewDate)}`
              : c.nextReviewDate === today()
                ? "today"
                : niceDate(c.nextReviewDate)}
          </strong>
        </span>
      </div>
      <div className="section-label">
        <h2>
          Goals and progress <span>{c.goals.length}</span>
        </h2>
        <div className="section-actions">
        <button
          className="btn secondary small"
          onClick={() =>
            openForm("campaign", {
              ...c,
              goals: [
                ...c.goals,
                newGoal(
                  state,
                  c.clientId,
                  c.goals.map((g) => `${g.accountId}:${g.kpiId}:${g.periodDays || 0}`),
                ),
              ],
            })
          }
        >
          <Plus size={15} /> Add a goal
        </button>
        <button
          className="btn secondary small"
          onClick={() =>
            openForm("metric", null, {
              campaignId: c.id,
              accountId: c.goals[0]?.accountId || "",
              kpiId: c.goals[0]?.kpiId || "",
            })
          }
        >
          <Plus size={15} /> Add numbers
        </button>
        </div>
      </div>
      <div className="goal-grid">
        {c.goals.map((g) => {
          const a = state.accounts.find((a) => a.id === g.accountId);
          const k = a?.kpis.find((k) => k.id === g.kpiId);
          const p = goalProgress(state, c, g);
          return (
            <section className="panel goal-panel" key={g.id}>
              <div className="goal-top">
                <span>
                  <Platform platform={a?.platform} />
                  {a?.handle}
                </span>
                <Badge
                  tone={!p.hasData ? "neutral" : p.onTrack ? "green" : "amber"}
                >
                  {!p.hasData
                    ? "Awaiting data"
                    : p.onTrack
                      ? "On track"
                      : "Behind pace"}
                </Badge>
              </div>
              <h3>
                {k?.name}
                {g.periodDays ? (
                  <small className="muted"> · {windowLabel(g.periodDays)}</small>
                ) : null}
              </h3>
              <div className="goal-value">
                <strong>{fmt(p.current, k?.unit)}</strong>
                <span>of {fmt(g.target, k?.unit)} target</span>
              </div>
              <TrendChart
                history={p.history}
                target={g.target}
                unit={k?.unit}
                height={145}
              />
              <div className="goal-foot">
                <span>
                  Start <strong>{fmt(g.baseline, k?.unit)}</strong>
                </span>
                <span>
                  {Math.round(p.percent)}% progress ·{" "}
                  {Math.round(p.expectedPercent)}% time elapsed
                </span>
              </div>
            </section>
          );
        })}
      </div>
      {!c.goals.length && (
        <Empty
          title="No goals set yet"
          description="A goal is one KPI on one account: where it starts and the number you want it to reach by the end date. Add one per KPI you want to move."
          action={
            <button
              className="btn primary"
              onClick={() =>
                openForm("campaign", {
                  ...c,
                  goals: [newGoal(state, c.clientId)],
                })
              }
            >
              <Plus size={15} /> Add a goal
            </button>
          }
        />
      )}
      <div className="section-label spaced">
        <h2>
          Strategies being tested <span>{strategies.length}</span>
        </h2>
        <button
          className="btn secondary small"
          onClick={() => openForm("strategy", null, { campaignId: c.id })}
        >
          <Plus size={15} /> Add strategy
        </button>
      </div>
      <div className="cards-grid fluid">
        {strategies.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            state={state}
            openForm={openForm}
            askClaude={askClaude}
            mutate={mutate}
          />
        ))}
      </div>
      <div className="section-label spaced">
        <h2>
          Content plan <span>{posts.length}</span>
        </h2>
        <button
          className="btn secondary small"
          onClick={() =>
            openForm("post", null, {
              campaignId: c.id,
              accountId:
                state.accounts.find((a) => a.clientId === c.clientId)?.id || "",
            })
          }
        >
          <Plus size={15} /> Plan content
        </button>
      </div>
      <div className="content-grid">
        {posts
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((p) => (
            <div key={p.id}>
              <div className="content-date">
                {niceDate(p.date)}{" "}
                <Badge tone={STATUS_TONE[p.status]}>
                  {statusLabel(p.status)}
                </Badge>
              </div>
              <PostCard post={p} state={state} onClick={openPost} />
            </div>
          ))}
      </div>
      <div className="section-label spaced">
        <h2>Assessments for this campaign</h2>
      </div>
      {state.assessments
        .filter((a) => a.entityType === "campaign" && a.entityId === c.id)
        .sort((a, b) => b.date.localeCompare(a.date))
        .map((a) => (
          <button
            className="panel assessment-summary"
            key={a.id}
            onClick={() => openForm("assessment", a)}
          >
            <Badge
              tone={
                a.rating === "positive"
                  ? "green"
                  : a.rating === "negative"
                    ? "red"
                    : "amber"
              }
            >
              {{
                positive: "Went well",
                mixed: "Mixed results",
                negative: "Did not go well",
              }[a.rating] || a.rating}
            </Badge>
            <strong>{niceDate(a.date)}</strong>
            <p>{a.summary || "Assessment saved"}</p>
            {a.nextTest && <span>Next: {a.nextTest}</span>}
          </button>
        ))}
      {!state.assessments.some(
        (a) => a.entityType === "campaign" && a.entityId === c.id,
      ) && (
        <div className="panel muted">
          No assessments yet. The first one is due{" "}
          {niceDate(c.nextReviewDate)}, but you can write one any time.
        </div>
      )}
    </>
  );
}
function Accounts({ state, data, openForm }) {
  const [detailId, setDetailId] = useState(null);
  const detail = state.accounts.find((a) => a.id === detailId);
  return (
    <>
      {detail && (
        <AccountDetail
          account={detail}
          state={state}
          openForm={openForm}
          onClose={() => setDetailId(null)}
        />
      )}
      <PageHeading
        title="Social accounts"
        description="Each account and the numbers you track for it, with the latest value."
      >
        <button className="btn secondary" onClick={() => openForm("client")}>
          <Plus size={16} /> Add client
        </button>
        <button className="btn primary" onClick={() => openForm("account")}>
          <Plus size={16} /> Add social account
        </button>
      </PageHeading>
      {data.clients.map((c) => (
        <section className="brand-section" key={c.id}>
          <div className="brand-section-heading">
            <Avatar client={c} />
            <div>
              <h2>{c.name}</h2>
              <span className="muted small">
                {c.industry || "Client"} ·{" "}
                {data.accounts.filter((a) => a.clientId === c.id).length}{" "}
                accounts
              </span>
            </div>
            <button
              className="btn ghost small"
              onClick={() => openForm("client", c)}
            >
              <Settings2 size={14} /> Edit client
            </button>
          </div>
          <div className="cards-grid">
            {data.accounts
              .filter((a) => a.clientId === c.id)
              .map((a) => (
                <section className="panel account-card" key={a.id}>
                  <div className="account-heading">
                    <button
                      type="button"
                      className="account-open"
                      aria-label={`See growth and progress for ${a.handle} ${a.platform}`}
                      onClick={() => setDetailId(a.id)}
                    >
                      <Platform platform={a.platform} size={23} />
                      <div>
                        <h3>{a.platform}</h3>
                        <span className="muted">{a.handle}</span>
                      </div>
                    </button>
                    <button
                      className="btn ghost small"
                      aria-label={`Edit ${a.handle} ${a.platform}`}
                      onClick={() => openForm("account", a)}
                    >
                      <Pencil size={13} /> Edit
                    </button>
                  </div>
                  <div className="account-metrics">
                    {a.kpis.map((k) => {
                      const metrics = state.metrics
                        .filter(
                          (m) =>
                            m.accountId === a.id &&
                            m.kpiId === k.id &&
                            !m.postId &&
                            !m.strategyId &&
                            !m.periodDays,
                        )
                        .sort((a, b) => a.date.localeCompare(b.date));
                      const periodic = state.metrics
                        .filter(
                          (m) =>
                            m.accountId === a.id &&
                            m.kpiId === k.id &&
                            !m.postId &&
                            !m.strategyId &&
                            m.periodDays,
                        )
                        .sort((a, b) => a.date.localeCompare(b.date));
                      const lastPeriodic = periodic.at(-1);
                      return (
                        <div key={k.id}>
                          <span className="metric-name">
                            <span className="metric-title" title={k.name}>
                              {k.name}
                            </span>
                            {lastPeriodic && !metrics.length && (
                              <small className="muted">
                                {windowLabel(lastPeriodic.periodDays)} ·{" "}
                                {niceDate(lastPeriodic.date)}
                              </small>
                            )}
                            {lastPeriodic && metrics.length > 0 && (
                              <small className="muted">
                                Latest {windowLabel(lastPeriodic.periodDays)}:{" "}
                                {fmt(lastPeriodic.value, k.unit)} (
                                {niceDate(lastPeriodic.date)})
                              </small>
                            )}
                          </span>
                          <strong>
                            {metrics.length
                              ? fmt(metrics.at(-1).value, k.unit)
                              : lastPeriodic
                                ? fmt(lastPeriodic.value, k.unit)
                                : "—"}
                          </strong>
                          <Sparkline
                            values={(metrics.length ? metrics : periodic.filter((m) => m.periodDays === lastPeriodic?.periodDays))
                              .slice(-10)
                              .map((m) => m.value)}
                            color={c.color}
                          />
                        </div>
                      );
                    })}
                  </div>
                  <div className="account-post-counts">
                    <span>
                      {
                        state.posts.filter(
                          (p) =>
                            p.accountId === a.id && p.status === "executed",
                        ).length
                      }{" "}
                      published
                    </span>
                    <span>
                      {
                        state.posts.filter(
                          (p) => p.accountId === a.id && p.status === "planned",
                        ).length
                      }{" "}
                      planned
                    </span>
                    <span>
                      {a.kpis.length} measure{a.kpis.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="account-card-actions">
                    <button
                      className="btn secondary"
                      onClick={() => setDetailId(a.id)}
                    >
                      <TrendingUp size={14} /> View growth
                    </button>
                    <button
                      className="btn secondary"
                      onClick={() =>
                        openForm("metric", null, {
                          accountId: a.id,
                          kpiId: a.kpis[0]?.id || "",
                        })
                      }
                    >
                      <Plus size={14} /> Add numbers
                    </button>
                  </div>
                </section>
              ))}
          </div>
          {!data.accounts.some((a) => a.clientId === c.id) && (
            <div className="panel empty-inline">
              <p className="muted">
                No social accounts for {c.name} yet.
              </p>
              <button
                className="btn secondary"
                onClick={() => openForm("account", null, { clientId: c.id })}
              >
                <Plus size={15} /> Add account
              </button>
            </div>
          )}
          <BeforeAfter state={state} client={c} />
        </section>
      ))}
      {!data.clients.length && (
        <Empty
          icon={Users}
          title="Add your first client"
          description="Add a client and we will walk you through its accounts and starting numbers."
          action={
            <button className="btn primary" onClick={() => openForm("client")}>
              Add client
            </button>
          }
        />
      )}
    </>
  );
}
function CalendarView({
  state,
  data,
  openForm,
  openPost,
  duplicatePost,
  focusMonth,
}) {
  const [month, setMonth] = useState(() => focusMonth || today().slice(0, 7));
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("month");
  const [range, setRange] = useState("month"); // list view: "month" | "all"
  const [search, setSearch] = useState("");
  const base = new Date(month + "-01T12:00:00");
  const shift = (n) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const first = new Date(base);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  // Only the weeks this month touches (4–6 rows), not a fixed 6.
  const monthEnd = new Date(base.getFullYear(), base.getMonth() + 1, 0, 12);
  const weeks = Math.ceil(((monthEnd - first) / 86400000 + 1) / 7);
  const days = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const posts = data.posts.filter(
    (p) => filter === "all" || p.status === filter,
  );
  const q = search.trim().toLowerCase();
  const agenda =
    range === "all"
      ? posts
          .filter((p) => !q || p.title.toLowerCase().includes(q))
          .sort((a, b) => b.date.localeCompare(a.date))
      : posts
          .filter((p) => p.date.startsWith(month))
          .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <PageHeading
        title="Content calendar"
        description="Plan what goes out and when. Open any post to add results, edit or duplicate it."
      >
        <button className="btn secondary" onClick={() => openForm("video")}>
          <Plus size={16} /> Add published video
        </button>
        <button className="btn primary" onClick={() => openForm("post")}>
          <Plus size={16} /> Plan content
        </button>
      </PageHeading>
      <div className="calendar-controls">
        <div className="month-picker">
          <button
            className="icon-btn"
            aria-label="Previous month"
            onClick={() => shift(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <h2>
            {base.toLocaleDateString("en", { month: "long", year: "numeric" })}
          </h2>
          <button
            className="icon-btn"
            aria-label="Next month"
            onClick={() => shift(1)}
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="btn secondary small"
            onClick={() => setMonth(today().slice(0, 7))}
          >
            Today
          </button>
        </div>
        <div className="calendar-filter">
          <select
            aria-label="Filter content status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All content</option>
            <option value="planned">Planned</option>
            <option value="executed">Published</option>
            <option value="cancelled">Cancelled</option>
          </select>
          <div className="segmented">
            <button
              className={view === "month" ? "selected" : ""}
              onClick={() => setView("month")}
            >
              Month
            </button>
            <button
              className={view === "agenda" ? "selected" : ""}
              onClick={() => setView("agenda")}
            >
              List
            </button>
          </div>
        </div>
      </div>
      <div className="calendar-legend">
        <span>
          <i className="readiness-dot ready" />
          Ready
        </span>
        <span>
          <i className="readiness-dot in-progress" />
          In progress
        </span>
        <span>
          <i className="readiness-dot needed" />
          To create
        </span>
        <span>
          <Check size={13} />
          Published
        </span>
      </div>
      {view === "month" ? (
        <div className="calendar-scroll">
          <div className="calendar-grid">
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
              <div className="calendar-weekday" key={d}>
                {d}
              </div>
            ))}
            {days.map((d) => (
              <div
                key={d}
                className={`calendar-day ${d.startsWith(month) ? "" : "other-month"} ${d === today() ? "today" : ""}`}
              >
                <div className="calendar-day-head">
                  <span>
                    {Number(d.slice(-2))}
                    {d === today() && <em className="today-label">Today</em>}
                  </span>
                  <button
                    aria-label={
                      d <= today()
                        ? `Add a published video on ${niceDate(d, { month: "long", day: "numeric" })}`
                        : `Plan content for ${niceDate(d, { month: "long", day: "numeric" })}`
                    }
                    title={
                      d <= today() ? "Add a published video" : "Plan content"
                    }
                    onClick={() =>
                      d <= today()
                        ? openForm("video", null, { date: d })
                        : openForm("post", null, { date: d })
                    }
                  >
                    <Plus size={13} />
                  </button>
                </div>
                {posts
                  .filter((p) => p.date === d)
                  .map((p) => (
                    <PostCard
                      key={p.id}
                      post={p}
                      state={state}
                      onClick={openPost}
                      compact
                    />
                  ))}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="agenda-list">
          <div className="filter-bar">
            <div className="segmented">
              <button
                className={range === "month" ? "selected" : ""}
                onClick={() => setRange("month")}
              >
                Month
              </button>
              <button
                className={range === "all" ? "selected" : ""}
                onClick={() => setRange("all")}
              >
                All history
              </button>
            </div>
            {range === "all" && (
              <>
                <input
                  type="search"
                  aria-label="Search posts by title"
                  placeholder="Search by title…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <span className="muted small">
                  {agenda.length} post{agenda.length === 1 ? "" : "s"}, newest first
                </span>
              </>
            )}
          </div>
          {agenda.map((p) => (
            <div className="agenda-row" key={p.id}>
              <span className="agenda-date">
                {niceDate(
                  p.date,
                  range === "all"
                    ? { month: "short", day: "numeric", year: "numeric" }
                    : { weekday: "short", month: "short", day: "numeric" },
                )}
              </span>
              <PostCard post={p} state={state} onClick={openPost} />
              <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
              <PostActions
                post={p}
                openForm={openForm}
                duplicatePost={duplicatePost}
              />
            </div>
          ))}
          {!agenda.length && (
            <Empty
              icon={CalendarDays}
              title={
                range === "all"
                  ? q
                    ? "No posts match your search"
                    : "No posts yet"
                  : `Nothing planned in ${base.toLocaleDateString("en", { month: "long", year: "numeric" })}`
              }
              description={
                range === "all"
                  ? "Videos and posts you add will be listed here with their dates."
                  : "Plan a post for this month, or switch to All history."
              }
              action={
                <button
                  className="btn primary"
                  onClick={() =>
                    openForm("post", null, { date: month + "-01" })
                  }
                >
                  Plan content
                </button>
              }
            />
          )}
        </div>
      )}
    </>
  );
}
function PostDetail({
  post: p,
  state,
  openForm,
  mutate,
  onClose,
  duplicatePost,
}) {
  const account = state.accounts.find((a) => a.id === p.accountId);
  const strategy = state.strategies.find((s) => s.id === p.strategyId);
  const campaign = state.campaigns.find((c) => c.id === p.campaignId);
  const [b, setB] = useState(false);
  const change = async (status) => {
    setB(true);
    const updated = { ...p, status };
    if (status === "executed") updated.executedAt = today();
    await mutate("posts", updated);
    setB(false);
  };
  return (
    <Dialog
      title={p.title}
      description={`${account?.handle} · ${account?.platform} · ${p.format}`}
      onClose={onClose}
    >
      <div className="post-detail-badges">
        <Badge tone={STATUS_TONE[p.status]}>{statusLabel(p.status)}</Badge>
        {p.status === "planned" && (
          <Badge tone={STATUS_TONE[p.readiness]}>
            Content: {readinessLabel(p.readiness).toLowerCase()}
          </Badge>
        )}
      </div>
      <div className="detail-meta">
        <div>
          <span>Planned for</span>
          <strong>{niceDate(p.date)}</strong>
        </div>
        <div>
          <span>Campaign</span>
          <strong>{campaign?.name || "No campaign"}</strong>
        </div>
        {strategy && (
          <div>
            <span>Strategy</span>
            <strong>{strategy.name}</strong>
          </div>
        )}
        <div>
          <span>Check results</span>
          <strong>
            {p.status === "executed"
              ? niceDate(
                  addDays(p.executedAt || p.date, p.reviewAfterDays || 7),
                )
              : `${p.reviewAfterDays || 7} days after it is published`}
          </strong>
        </div>
      </div>
      <div className="post-outline">
        <h3>Outline and notes</h3>
        <p>
          {p.notes ||
            "No notes yet. Click Edit to describe the idea and what you still need to prepare."}
        </p>
      </div>
      {p.url && (
        <a
          className="text-btn"
          target="_blank"
          rel="noreferrer"
          href={/^https?:\/\//i.test(p.url) ? p.url : "#"}
        >
          View published content <ExternalLink size={14} />
        </a>
      )}
      {(p.tacticIds || []).length > 0 && (
        <div className="chip-row">
          {p.tacticIds.map((id) => (
            <span className="chip on" key={id}>
              {state.tactics.find((t) => t.id === id)?.name || "Tactic"}
            </span>
          ))}
        </div>
      )}
      <div className="post-metric-list">
        <h3>Results so far</h3>
        {!state.metrics.some((m) => m.postId === p.id) && (
          <p className="muted small">
            {p.status === "executed"
              ? "No results recorded yet. Add its numbers below."
              : "Results can be added once it is published."}
          </p>
        )}
        {state.metrics
          .filter((m) => m.postId === p.id)
          .map((m) => (
            <div key={m.id}>
              <span>
                {account?.kpis.find((k) => k.id === m.kpiId)?.name}
                {m.periodDays ? ` · ${windowLabel(m.periodDays)}` : ""}
              </span>
              <strong>
                {fmt(
                  m.value,
                  account?.kpis.find((k) => k.id === m.kpiId)?.unit,
                )}
              </strong>
              <span>{niceDate(m.date)}</span>
            </div>
          ))}
      </div>
      <div className="post-detail-actions">
        <button className="btn secondary" onClick={() => openForm("post", p)}>
          <Pencil size={15} /> Edit
        </button>
        <button className="btn secondary" onClick={() => duplicatePost(p)}>
          <Copy size={15} /> Duplicate
        </button>
        {p.status === "executed" && (
        <>
        <button
          className="btn secondary"
          onClick={() =>
            openForm("metric", null, {
              accountId: p.accountId,
              kpiId: account?.kpis[0]?.id || "",
              campaignId: p.campaignId,
              strategyId: p.strategyId || "",
              postId: p.id,
              fromCalendar: true,
            })
          }
        >
          <Plus size={15} /> Add results
        </button>
        <button
          className="btn secondary"
          title="Numbers for this one video over its first 7 days"
          onClick={() => {
            const start = p.executedAt || p.date;
            const end = addDays(start, 7);
            openForm("metric", null, {
              accountId: p.accountId,
              kpiId: account?.kpis[0]?.id || "",
              campaignId: p.campaignId,
              strategyId: p.strategyId || "",
              postId: p.id,
              fromCalendar: true,
              periodDays: "7",
              date: end > today() ? today() : end,
            });
          }}
        >
          <Plus size={15} /> Add first-week results
        </button>
        </>
        )}
        {p.status === "executed" && (
          <button
            className="btn primary"
            onClick={() =>
              openForm("assessment", null, {
                entityType: "post",
                entityId: p.id,
              })
            }
          >
            <ClipboardCheck size={15} /> Write assessment
          </button>
        )}
      </div>
      {p.status === "planned" && (
        <div className="dialog-footer">
          <button
            className="btn ghost danger"
            disabled={b}
            onClick={() => change("cancelled")}
          >
            Cancel this post
          </button>
          <button
            className="btn primary"
            disabled={b}
            onClick={() => change("executed")}
          >
            <Check size={16} /> Mark as published
          </button>
        </div>
      )}
      {p.status === "cancelled" && (
        <div className="dialog-footer">
          <button
            className="btn secondary"
            disabled={b}
            onClick={() => change("planned")}
          >
            Put back on the plan
          </button>
        </div>
      )}
    </Dialog>
  );
}
function DataView({
  state,
  data,
  clientId,
  openForm,
  onState,
  onToast,
  mutateMany,
}) {
  const [tab, setTab] = useState("import");
  const [picked, setPicked] = useState([]);
  const [bulkCampaign, setBulkCampaign] = useState("");
  const [bulkBusy, setBulkBusy] = useState(false);
  const [metricAccount, setMetricAccount] = useState("all");
  const [fKpi, setFKpi] = useState("all");
  const [fType, setFType] = useState("all");
  const [fAttr, setFAttr] = useState("all");
  const [fFrom, setFFrom] = useState("");
  const [fTo, setFTo] = useState("");
  const [bulkPeriod, setBulkPeriod] = useState("");
  const [confirmDeleteRows, setConfirmDeleteRows] = useState(false);
  const accountKpis = data.accounts
    .filter((a) => metricAccount === "all" || a.id === metricAccount)
    .flatMap((a) => a.kpis);
  const kpiNames = [...new Set(accountKpis.map((k) => k.name))].sort();
  const typesPresent = [
    ...new Set(state.metrics.map((m) => m.periodDays || 0)),
  ].sort((a, b) => a - b);
  const anyFilter =
    metricAccount !== "all" ||
    fKpi !== "all" ||
    fType !== "all" ||
    fAttr !== "all" ||
    fFrom ||
    fTo;
  const resetFilters = () => {
    setMetricAccount("all");
    setFKpi("all");
    setFType("all");
    setFAttr("all");
    setFFrom("");
    setFTo("");
  };
  const filtered = state.metrics
    .filter((m) => {
      if (!data.accounts.some((a) => a.id === m.accountId)) return false;
      if (metricAccount !== "all" && m.accountId !== metricAccount) return false;
      if (fKpi !== "all") {
        const k = state.accounts
          .find((a) => a.id === m.accountId)
          ?.kpis.find((k) => k.id === m.kpiId);
        if (k?.name !== fKpi) return false;
      }
      if (fType !== "all" && (m.periodDays || 0) !== Number(fType)) return false;
      if (fAttr === "whole" && (m.campaignId || m.postId || m.strategyId)) return false;
      if (fAttr === "content" && !(m.postId || m.strategyId)) return false;
      if (fAttr.startsWith("campaign:") && m.campaignId !== fAttr.slice(9)) return false;
      if (fFrom && m.date < fFrom) return false;
      if (fTo && m.date > fTo) return false;
      return true;
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const shown = filtered.slice(0, 200);
  const pickedRows = state.metrics.filter((m) => picked.includes(m.id));
  const pickedClients = new Set(
    pickedRows.map((m) => state.accounts.find((a) => a.id === m.accountId)?.clientId),
  );
  const bulkOptions = state.campaigns.filter(
    (c) => pickedClients.size === 1 && pickedClients.has(c.clientId),
  );
  const blocked = pickedRows.filter((m) => m.postId || m.strategyId).length;
  const runBulk = async (operations) => {
    if (!operations.length) return;
    setBulkBusy(true);
    try {
      await mutateMany(operations);
      setPicked([]);
      setBulkCampaign("");
      setConfirmDeleteRows(false);
    } catch (err) {
      onToast(err.message, "error");
    } finally {
      setBulkBusy(false);
    }
  };
  const applyCampaign = (campaignId) =>
    runBulk(
      pickedRows
        .filter((m) => !m.postId && !m.strategyId)
        .map((m) => {
          const { campaignId: _old, ...rest } = m;
          return {
            op: "upsert",
            collection: "metrics",
            value: campaignId ? { ...rest, campaignId } : rest,
          };
        }),
    );
  const applyPeriod = () =>
    runBulk(
      pickedRows.map((m) => {
        const { periodDays: _old, ...rest } = m;
        const days = Math.round(Number(bulkPeriod));
        return {
          op: "upsert",
          collection: "metrics",
          value: days >= 1 ? { ...rest, periodDays: days } : rest,
        };
      }),
    );
  const deletePicked = () =>
    runBulk(
      pickedRows.map((m) => ({ op: "delete", collection: "metrics", id: m.id })),
    );
  return (
    <>
      <PageHeading
        title="Data & imports"
        description="Type numbers in by hand, import a CSV or Excel report, and review everything you have recorded."
      >
        <a className="btn secondary" href="/api/export" download>
          <Download size={16} /> Download backup
        </a>
        <button className="btn primary" onClick={() => openForm("metric")}>
          <Plus size={16} /> Add numbers
        </button>
      </PageHeading>
      <div className="tabs" role="tablist" aria-label="Data views">
        {[
          ["import", "Import a report"],
          ["history", "All recorded numbers", filtered.length],
          ["activity", "Recent changes"],
        ].map(([id, label, n]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label} {n !== undefined && <span>{n}</span>}
          </button>
        ))}
      </div>
      {tab === "import" && (
        <ImportPanel
          state={state}
          onState={onState}
          onToast={onToast}
          clientId={clientId}
        />
      )}
      {tab === "history" && (
        <section className="panel">
          <PanelHeader
            title="Recorded numbers"
            description="Each row is the number as it stood on that date. Rows are not added together."
          />
          <div className="filter-bar">
            <label className="field">
              <span>Account</span>
              <select
                aria-label="Filter by account"
                value={metricAccount}
                onChange={(e) => {
                  setMetricAccount(e.target.value);
                  setFKpi("all");
                }}
              >
                <option value="all">All accounts</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.handle} · {a.platform}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>KPI</span>
              <select
                aria-label="Filter by KPI"
                value={fKpi}
                onChange={(e) => setFKpi(e.target.value)}
              >
                <option value="all">All KPIs</option>
                {kpiNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Type of number</span>
              <select
                aria-label="Filter by type of number"
                value={fType}
                onChange={(e) => setFType(e.target.value)}
              >
                <option value="all">All types</option>
                {typesPresent.map((d) => (
                  <option key={d} value={d}>
                    {d ? titleCase(windowLabel(d)) : "Running total"}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Linked to</span>
              <select
                aria-label="Filter by attribution"
                value={fAttr}
                onChange={(e) => setFAttr(e.target.value)}
              >
                <option value="all">Anything</option>
                <option value="whole">Whole account only</option>
                {state.campaigns.map((c) => (
                  <option key={c.id} value={`campaign:${c.id}`}>
                    Campaign: {c.name}
                  </option>
                ))}
                <option value="content">A post or strategy</option>
              </select>
            </label>
            <label className="field">
              <span>Dated from</span>
              <input
                type="date"
                value={fFrom}
                max={fTo || undefined}
                onChange={(e) => setFFrom(e.target.value)}
              />
            </label>
            <label className="field">
              <span>Dated to</span>
              <input
                type="date"
                value={fTo}
                min={fFrom || undefined}
                onChange={(e) => setFTo(e.target.value)}
              />
            </label>
            {anyFilter && (
              <button className="btn ghost small" onClick={resetFilters}>
                Reset filters
              </button>
            )}
          </div>
          <p className="muted small">
            Showing {shown.length} of {filtered.length} matching numbers.
            {filtered.length > shown.length && (
              <>
                {" "}
                <button
                  className="text-btn"
                  onClick={() => setPicked(filtered.map((m) => m.id))}
                >
                  Select all {filtered.length} matching
                </button>
              </>
            )}
          </p>
          {picked.length > 0 && (
            <div className="bulk-bar">
              <strong>{picked.length} selected</strong>
              <select
                aria-label="Campaign to link"
                value={bulkCampaign}
                onChange={(e) => setBulkCampaign(e.target.value)}
                disabled={!bulkOptions.length}
              >
                <option value="">
                  {pickedClients.size > 1
                    ? "Select rows from one client"
                    : "Choose a campaign…"}
                </option>
                {bulkOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <button
                className="btn primary small"
                disabled={!bulkCampaign || bulkBusy}
                onClick={() => applyCampaign(bulkCampaign)}
              >
                Link to campaign
              </button>
              <button
                className="btn ghost small"
                disabled={bulkBusy}
                onClick={() => applyCampaign("")}
              >
                Make whole account
              </button>
              <span className="bulk-sep" />
              <PeriodSelect value={bulkPeriod} onChange={setBulkPeriod} />
              <button
                className="btn secondary small"
                disabled={bulkBusy}
                onClick={applyPeriod}
              >
                Set type of number
              </button>
              <span className="bulk-sep" />
              {confirmDeleteRows ? (
                <>
                  <strong className="warn-text">
                    Delete {picked.length} number{picked.length === 1 ? "" : "s"}?
                  </strong>
                  <button
                    className="btn danger small"
                    disabled={bulkBusy}
                    onClick={deletePicked}
                  >
                    Yes, delete
                  </button>
                  <button
                    className="btn ghost small"
                    onClick={() => setConfirmDeleteRows(false)}
                  >
                    Keep
                  </button>
                </>
              ) : (
                <button
                  className="btn ghost danger small"
                  onClick={() => setConfirmDeleteRows(true)}
                >
                  Delete selected
                </button>
              )}
              <button className="btn ghost small" onClick={() => setPicked([])}>
                Clear
              </button>
              {blocked > 0 && (
                <span className="muted small">
                  {blocked} linked to a post or strategy will be skipped.
                </span>
              )}
            </div>
          )}
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      aria-label="Select all shown"
                      checked={shown.length > 0 && shown.every((m) => picked.includes(m.id))}
                      onChange={(e) =>
                        setPicked(e.target.checked ? shown.map((m) => m.id) : [])
                      }
                    />
                  </th>
                  <th>Date</th>
                  <th>Account</th>
                  <th>KPI</th>
                  <th>Value</th>
                  <th>Attribution</th>
                  <th>Source</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {shown.map((m) => {
                  const a = state.accounts.find((a) => a.id === m.accountId);
                  const k = a?.kpis.find((k) => k.id === m.kpiId);
                  return (
                    <tr key={m.id}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label="Select this number"
                          checked={picked.includes(m.id)}
                          onChange={(e) =>
                            setPicked((l) =>
                              e.target.checked ? [...l, m.id] : l.filter((x) => x !== m.id),
                            )
                          }
                        />
                      </td>
                      <td>{niceDate(m.date)}</td>
                      <td>
                        <span className="table-account">
                          <Platform platform={a?.platform} size={14} />
                          {a?.handle}
                        </span>
                      </td>
                      <td>
                        {k?.name}
                        {m.periodDays ? (
                          <small className="muted">
                            {" "}
                            · {windowLabel(m.periodDays)}
                          </small>
                        ) : null}
                      </td>
                      <td>
                        <strong>{fmt(m.value, k?.unit)}</strong>
                      </td>
                      <td>
                        {m.postId
                          ? state.posts.find((p) => p.id === m.postId)?.title
                          : m.strategyId
                            ? state.strategies.find(
                                (s) => s.id === m.strategyId,
                              )?.name
                            : m.campaignId
                              ? `${state.campaigns.find((c) => c.id === m.campaignId)?.name || "Campaign"} (campaign)`
                              : "Whole account"}
                      </td>
                      <td>{m.source || "manual"}</td>
                      <td>
                        <button
                          className="icon-btn"
                          title="Edit this number"
                          aria-label={`Edit ${k?.name || "number"} on ${niceDate(m.date)}`}
                          onClick={() => openForm("metric", m)}
                        >
                          <Pencil size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filtered.length && (
            <Empty
              title={anyFilter ? "No numbers match these filters" : "No numbers recorded yet"}
              description={
                anyFilter
                  ? "Try widening the dates or choosing another account."
                  : "Add your first numbers by hand, or import a report."
              }
              action={
                anyFilter ? (
                  <button className="btn secondary" onClick={resetFilters}>
                    Reset filters
                  </button>
                ) : null
              }
            />
          )}
          {filtered.length > 200 && (
            <p className="muted small">
              Showing the latest 200. Narrow the filters, or download a backup
              for the full history.
            </p>
          )}
        </section>
      )}
      {tab === "activity" && (
        <section className="panel">
          <PanelHeader
            title="Recent changes"
            description="What was saved to your workspace, newest first."
          />
          {state.activity
            .slice()
            .reverse()
            .slice(0, 100)
            .map((a) => (
              <div className="activity-row" key={a.id}>
                <CheckCircle2 size={16} />
                <span>{a.description}</span>
                <time>{new Date(a.at).toLocaleString()}</time>
              </div>
            ))}
        </section>
      )}
      <div className="notice spaced">
        <Folder size={19} />
        <span>
          Everything is saved on this computer in <code>data/workspace.json</code>,
          and each save keeps a backup copy. To import from a chat, attach the
          report and ask Claude to look at the columns and import the numbers.
        </span>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
