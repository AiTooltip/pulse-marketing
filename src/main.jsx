import React, { useEffect, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
  Activity,
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
  CodexPrompt,
  fmt,
  niceDate,
  uid,
  titleCase,
  clamp,
} from "./components.jsx";
import EntityForm from "./Forms.jsx";
import ImportPanel from "./ImportPanel.jsx";
import { ReviewsView, PracticesView } from "./ReviewViews.jsx";
import "./styles.css";
const NAV = [
  ["overview", "Overview", LayoutDashboard],
  ["campaigns", "Campaigns", Target],
  ["calendar", "Content calendar", CalendarDays],
  ["accounts", "Social accounts", Users],
  ["strategies", "Strategy lab", FlaskConical],
  ["reviews", "Assessments", ClipboardCheck],
  ["practices", "Best practices", BookOpen],
  ["imports", "Data & imports", Database],
];
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
    posts: state.posts.filter((p) => cids.has(p.campaignId)),
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
  const [page, setPage] = useState("overview");
  const [clientId, setClientId] = useState("all");
  const [modal, setModal] = useState(null);
  const [post, setPost] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [connection, setConnection] = useState(true);
  const [mobile, setMobile] = useState(false);
  const [focusCampaign, setFocusCampaign] = useState(null);
  const [stateBusy, setStateBusy] = useState(false);
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
  const notify = (message, type = "success") => {
    setToast({ message, type });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 5500);
  };
  const openForm = (type, value = null, prefill = {}) => {
    const s = stateRef.current;
    if (!value) {
      if (["account", "campaign"].includes(type) && !s.clients.length) {
        notify("Start by adding your first client.");
        type = "client";
        prefill = {};
      } else if (["post", "metric"].includes(type) && !s.accounts.length) {
        notify("Add a social account before recording content or metrics.");
        type = s.clients.length ? "account" : "client";
        prefill = {};
      } else if (
        ["post", "strategy", "assessment"].includes(type) &&
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
    setPage(p);
    setMobile(false);
    if (p !== "campaigns") setFocusCampaign(null);
    window.scrollTo(0, 0);
  };
  const openCampaign = (c) => {
    setFocusCampaign(c.id);
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
  const due = notifications(state).filter((n) => n.date <= today()).length;
  const shared = {
    state,
    clientId,
    openForm,
    mutate: safeMutate,
    askCodex: setPrompt,
  };
  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobile ? "open" : ""}`}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-symbol">
            <Activity size={24} />
          </span>
          <span>
            pulse<span className="brand-period">.</span>
          </span>
          <span className="workspace-tag">WORKSPACE</span>
        </a>
        <div className="workspace-switch">
          <span className="workspace-avatar">S</span>
          <div>
            <strong>{state.settings.workspaceName || "Your workspace"}</strong>
            <span>{state.clients.length} brands · local workspace</span>
          </div>
          <Folder size={16} />
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {NAV.map(([id, label, Icon], i) => (
            <React.Fragment key={id}>
              {i === 6 && <div className="nav-label second">INTELLIGENCE</div>}
              <button
                className={`nav-item ${page === id ? "active" : ""}`}
                onClick={() => navigate(id)}
              >
                <Icon size={19} />
                <span>{label}</span>
                {id === "reviews" && due > 0 && (
                  <span className="nav-count">{due}</span>
                )}
              </button>
            </React.Fragment>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="codex-box">
            <Sparkles size={21} />
            <h3>Your thinking partner.</h3>
            <p>Turn your results into the next good idea.</p>
            <button
              onClick={() =>
                setPrompt(
                  "Review my marketing workspace. Tell me what needs attention today, which strategies have the strongest evidence, and suggest one focused experiment to run next.",
                )
              }
            >
              <span>Work with Codex</span>
              <ArrowUpRight size={16} />
            </button>
          </div>
          <div className="local-status">
            <span className={`status-dot ${connection ? "" : "offline"}`} />
            <span>{connection ? "Saved locally" : "Connection lost"}</span>
            <span className="local-label">Your data. Your folder.</span>
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
              aria-label="Toggle navigation"
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <ChevronRight size={14} />
            <strong>{NAV.find((n) => n[0] === page)?.[1]}</strong>
          </div>
          <div className="topbar-actions">
            <span className="local-pill">
              <span className="status-dot" />{" "}
              {state.metrics.some((m) => m.source === "demo")
                ? "Includes demo data"
                : "Local workspace"}
            </span>
            <button
              className="icon-btn notifications-button"
              onClick={() => navigate("reviews")}
              aria-label={`${due} reviews and reminders due`}
            >
              <Bell size={19} />
              {due > 0 && <span />}
            </button>
            <span className="user-avatar">S</span>
          </div>
        </header>
        <main>
          <div className="workspace-toolbar">
            <div className="client-switch">
              <Users size={16} />
              <select
                aria-label="Filter by client"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  setFocusCampaign(null);
                }}
              >
                <option value="all">All clients</option>
                {state.clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="client-count">
                {clientId === "all" ? state.clients.length : "1"}
              </span>
            </div>
            <button
              className="btn ghost small"
              onClick={() => openForm("client")}
            >
              <Plus size={15} /> Add client
            </button>
            <div className="toolbar-date">
              <CalendarDays size={15} />
              {niceDate(today(), {
                weekday: "short",
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </div>
          </div>
          {!connection && (
            <div className="error">
              The local server is unavailable. Your last loaded data is shown.
              Restart it with <code>npm start</code>.
            </div>
          )}
          {page === "overview" && (
            <Overview
              {...shared}
              data={data}
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
            />
          )}
          {page === "calendar" && (
            <CalendarView {...shared} data={data} openPost={setPost} />
          )}
          {page === "accounts" && <Accounts {...shared} data={data} />}
          {page === "strategies" && <Strategies {...shared} data={data} />}
          {page === "reviews" && <ReviewsView {...shared} />}
          {page === "practices" && <PracticesView {...shared} />}
          {page === "imports" && (
            <DataView
              {...shared}
              data={data}
              onState={setState}
              onToast={notify}
            />
          )}
          <footer className="page-footer">
            <span>Made for thoughtful marketing.</span>
            <span>Pulse / Local-first workspace</span>
          </footer>
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
          onDelete={remove}
        />
      )}
      {post && (
        <PostDetail
          post={state.posts.find((p) => p.id === post.id) || post}
          {...shared}
          onClose={() => setPost(null)}
        />
      )}
      {prompt && <CodexPrompt prompt={prompt} onClose={() => setPrompt("")} />}
      {toast && (
        <div className={`toast ${toast.type}`} role="status">
          {toast.type === "error" ? (
            <TriangleAlert size={18} />
          ) : (
            <CheckCircle2 size={18} />
          )}
          <span>{toast.message}</span>
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
  data,
  openForm,
  navigate,
  openCampaign,
  openPost,
  askCodex,
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
        title="Your marketing, in focus."
        description="A little perspective. A clearer next move."
        eyebrow="THE CONTROL CENTER"
      >
        <button className="btn secondary" onClick={() => navigate("imports")}>
          <Upload size={16} /> Import metrics
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
          sub={
            <>
              <span className="green-text">
                Across {data.clients.length}{" "}
                {data.clients.length === 1 ? "brand" : "brands"}
              </span>
              <span> {data.accounts.length} social accounts</span>
            </>
          }
        />
        <StatCard
          icon={TrendingUp}
          label="Goals on track"
          value={`${onTrack} / ${goals.length}`}
          sub={
            <>
              <span className="green-text">
                {Math.round(avg)}% avg. progress
              </span>
              <span> from starting values</span>
            </>
          }
        />
        <StatCard
          icon={CalendarDays}
          label="Content this week"
          value={weekly.length}
          sub={
            <>
              <span className="green-text">
                {weekly.filter((p) => p.readiness === "ready").length} ready
              </span>
              <span>
                {" "}
                {weekly.filter((p) => p.readiness !== "ready").length} to
                prepare
              </span>
            </>
          }
        />
        <StatCard
          icon={FlaskConical}
          label="Active experiments"
          value={data.strategies.filter((s) => s.status !== "paused").length}
          sub={
            <>
              <span className="purple-text">
                {data.strategies.filter((s) => s.status === "promising").length}{" "}
                promising
              </span>
              <span> keep learning</span>
            </>
          }
          color="#a08bbc"
        />
      </div>
      <div className="overview-middle">
        <section className="panel trend-panel">
          <PanelHeader
            title="Performance over time"
            description="See the direction, not just the number."
            action={
              <span className="chart-key">
                <i /> Actual <i className="target-key" /> Target
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
              Record a metric <Plus size={13} />
            </button>
          </div>
        </section>
        <section className="panel pulse-panel">
          <PanelHeader
            title="Campaign pulse"
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
                  <em>average progress</em>
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
                Needs attention
              </span>
              <strong>
                {goals.filter((g) => g.hasData && !g.onTrack).length} goals
              </strong>
            </div>
            <div>
              <span>
                <i className="legend-dot gray" />
                Awaiting data
              </span>
              <strong>{goals.filter((g) => !g.hasData).length} goals</strong>
            </div>
          </div>
          <button className="panel-link" onClick={() => navigate("campaigns")}>
            Explore campaigns <ArrowRight size={16} />
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
              title="Make your first move"
              description="Create a campaign to set goals and start tracking."
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
            title="Strategies finding their stride"
            description="Ranked by progress against matching KPI goals."
            action={
              <button
                className="icon-btn"
                aria-label="Open strategy lab"
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
                    {s.samples === 1 ? "observation" : "observations"}
                  </span>
                </div>
                <div className="rank-value">
                  <strong>{Math.round(s.score)}%</strong>
                  <span>goal progress</span>
                </div>
                <ArrowUpRight size={16} />
              </button>
            ))}
            {!strategyRank.length && (
              <Empty
                icon={FlaskConical}
                title="Experiments need evidence"
                description="Link metrics to a strategy or post to see what performs."
              />
            )}
          </div>
          <button
            className="insight-callout"
            onClick={() =>
              askCodex(
                "Analyze my best-performing strategies using the metrics and assessments in this workspace. Explain possible reasons, note confounding variables and sample size, then save an evidence-backed best practice and propose a controlled next test.",
              )
            }
          >
            <span className="insight-icon">
              <Sparkles size={18} />
            </span>
            <div>
              <strong>Find the why behind the results</strong>
              <span>Explore patterns with Codex</span>
            </div>
            <ArrowUpRight size={17} />
          </button>
        </section>
        <section className="panel">
          <PanelHeader
            title="Up next on your calendar"
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
                  <span
                    className={`readiness-dot ${p.readiness}`}
                    title={p.readiness}
                  />
                </button>
              );
            })}
            {!upcoming.length && (
              <Empty
                icon={CalendarDays}
                title="A little room to plan"
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
        <Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge>
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
        <span>{c.goals.length} KPI goals</span>
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
  askCodex,
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
        askCodex={askCodex}
      />
    );
  return (
    <>
      <PageHeading
        title="Campaigns"
        description="Set the destination. Keep every account moving toward it."
      >
        <button className="btn primary" onClick={() => openForm("campaign")}>
          <Plus size={16} /> New campaign
        </button>
      </PageHeading>
      <div className="tabs">
        {["all", "active", "planned", "paused", "completed"].map((s) => (
          <button
            key={s}
            className={filter === s ? "selected" : ""}
            onClick={() => setFilter(s)}
          >
            {titleCase(s)}{" "}
            <span>
              {
                data.campaigns.filter((c) => s === "all" || c.status === s)
                  .length
              }
            </span>
          </button>
        ))}
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
          description="Start with an objective, a time frame, and the KPIs that matter."
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
  );
}
function CampaignDetail({
  state,
  campaign: c,
  onBack,
  openForm,
  openPost,
  askCodex,
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
          <ClipboardCheck size={16} /> Assess campaign
        </button>
      </PageHeading>
      <div className="campaign-meta">
        <Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge>
        <span>
          <CalendarDays size={16} />
          {niceDate(c.startDate)} — {niceDate(c.endDate)}
        </span>
        <span>
          <Clock size={16} />
          Assess every {c.reviewEveryDays} days
        </span>
        <span>
          Next review: <strong>{niceDate(c.nextReviewDate)}</strong>
        </span>
      </div>
      <div className="section-label">
        <h2>Goals & progress</h2>
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
          <Plus size={15} /> Record metric
        </button>
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
              <h3>{k?.name}</h3>
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
          title="Give this campaign a target"
          action={
            <button
              className="btn secondary"
              onClick={() => openForm("campaign", c)}
            >
              Add account goals
            </button>
          }
        />
      )}
      <div className="section-label spaced">
        <h2>
          Strategies & experiments <span>{strategies.length}</span>
        </h2>
        <button
          className="btn secondary small"
          onClick={() => openForm("strategy", null, { campaignId: c.id })}
        >
          <Plus size={15} /> Add strategy
        </button>
      </div>
      <div className="cards-grid">
        {strategies.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            state={state}
            openForm={openForm}
            askCodex={askCodex}
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
                  {titleCase(p.status)}
                </Badge>
              </div>
              <PostCard post={p} state={state} onClick={openPost} />
            </div>
          ))}
      </div>
      <div className="section-label spaced">
        <h2>Campaign assessments</h2>
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
            <Badge tone={a.rating === "positive" ? "green" : "amber"}>
              {a.rating}
            </Badge>
            <strong>{niceDate(a.date)}</strong>
            <p>{a.summary || "Assessment recorded"}</p>
            {a.nextTest && <span>Next: {a.nextTest}</span>}
          </button>
        ))}
      {!state.assessments.some(
        (a) => a.entityType === "campaign" && a.entityId === c.id,
      ) && (
        <div className="panel muted">
          Your first campaign assessment is due {niceDate(c.nextReviewDate)}.
          You can assess earlier whenever useful.
        </div>
      )}
    </>
  );
}
function StrategyCard({ strategy: s, state, openForm, askCodex }) {
  const perf = strategyPerformance(state, s);
  const c = state.campaigns.find((c) => c.id === s.campaignId);
  return (
    <section className="panel strategy-card">
      <div className="strategy-card-top">
        <span className="strategy-icon">
          <FlaskConical size={18} />
        </span>
        <Badge tone={STATUS_TONE[s.status]}>{titleCase(s.status)}</Badge>
        <button
          className="icon-btn"
          aria-label={`Edit ${s.name}`}
          onClick={() => openForm("strategy", s)}
        >
          <MoreHorizontal size={18} />
        </button>
      </div>
      <h3>{s.name}</h3>
      <span className="muted small">{c?.name}</span>
      <p>{s.hypothesis || "Add the hypothesis behind this experiment."}</p>
      <div className="strategy-result">
        <strong>
          {perf.score === null ? "—" : `${Math.round(perf.score)}%`}
        </strong>
        <span>
          {perf.score === null
            ? "Awaiting linked metrics"
            : `normalized goal progress · ${perf.samples} observations`}
        </span>
      </div>
      <div className="strategy-review">
        <Clock size={14} /> Next review {niceDate(s.nextReviewDate)}{" "}
        <span>Every {s.reviewEveryDays}d</span>
      </div>
      <div className="card-actions">
        <button
          className="btn secondary small"
          onClick={() =>
            openForm("assessment", null, {
              entityType: "strategy",
              entityId: s.id,
            })
          }
        >
          Assess
        </button>
        <button
          className="btn ghost small"
          onClick={() =>
            askCodex(
              `Analyze the strategy "${s.name}" (${s.id}). Read its attributed metrics, posts, and assessments. Explain plausible reasons for its results, limitations, and propose one controlled follow-up experiment. Save a best practice with evidence if justified.`,
            )
          }
        >
          <Sparkles size={14} /> Explore why
        </button>
      </div>
    </section>
  );
}
function Strategies({ state, data, openForm, askCodex }) {
  const [sort, setSort] = useState("performance");
  let list = data.strategies.map((s) => ({
    ...s,
    performance: strategyPerformance(state, s),
  }));
  list.sort(
    sort === "performance"
      ? (a, b) =>
          (b.performance.score ?? -Infinity) -
          (a.performance.score ?? -Infinity)
      : (a, b) => a.nextReviewDate.localeCompare(b.nextReviewDate),
  );
  return (
    <>
      <PageHeading
        title="Good marketing is a series of experiments."
        description="Keep a hypothesis. Change one thing. Learn something worth repeating."
        eyebrow="STRATEGY LAB"
      >
        <button className="btn primary" onClick={() => openForm("strategy")}>
          <Plus size={16} /> New strategy
        </button>
      </PageHeading>
      <div className="section-label">
        <p className="muted">
          {list.length} strategies · ranked using attributed results
        </p>
        <select
          aria-label="Sort strategies"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="performance">Best performance</option>
          <option value="review">Next review date</option>
        </select>
      </div>
      <div className="cards-grid">
        {list.map((s) => (
          <StrategyCard
            key={s.id}
            strategy={s}
            state={state}
            openForm={openForm}
            askCodex={askCodex}
          />
        ))}
      </div>
      {!list.length && (
        <Empty
          icon={FlaskConical}
          title="What would you like to test?"
          description="Add a strategy to your campaign, then link content and results to it."
          action={
            <button
              className="btn primary"
              onClick={() => openForm("strategy")}
            >
              New strategy
            </button>
          }
        />
      )}
      <div className="notice spaced">
        <FlaskConical size={18} />
        <span>
          Rankings describe recorded performance against each campaign’s goals.
          Different KPIs, sample sizes, and reporting windows may not be
          directly comparable. Ask Codex to examine the evidence before drawing
          conclusions.
        </span>
      </div>
    </>
  );
}
function Accounts({ state, data, openForm }) {
  return (
    <>
      <PageHeading
        title="Every account. Its own ambition."
        description="Choose the KPIs that matter for each channel and each client."
        eyebrow="SOCIAL ACCOUNTS"
      >
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
              <span className="muted small">{c.industry || "Your brand"}</span>
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
                    <Platform platform={a.platform} size={23} />
                    <div>
                      <h3>{a.platform}</h3>
                      <span className="muted">{a.handle}</span>
                    </div>
                    <button
                      className="icon-btn"
                      aria-label={`Edit ${a.handle} ${a.platform}`}
                      onClick={() => openForm("account", a)}
                    >
                      <MoreHorizontal size={18} />
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
                            !m.strategyId,
                        )
                        .sort((a, b) => a.date.localeCompare(b.date));
                      return (
                        <div key={k.id}>
                          <span>{k.name}</span>
                          <strong>
                            {metrics.length
                              ? fmt(metrics.at(-1).value, k.unit)
                              : "—"}
                          </strong>
                          <Sparkline
                            values={metrics.slice(-10).map((m) => m.value)}
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
                      live
                    </span>
                    <span>
                      {
                        state.posts.filter(
                          (p) => p.accountId === a.id && p.status === "planned",
                        ).length
                      }{" "}
                      planned
                    </span>
                    <span>{a.kpis.length} KPIs</span>
                  </div>
                  <button
                    className="btn secondary full"
                    onClick={() =>
                      openForm("metric", null, {
                        accountId: a.id,
                        kpiId: a.kpis[0]?.id || "",
                      })
                    }
                  >
                    <Plus size={14} /> Record metric
                  </button>
                </section>
              ))}
          </div>
          {!data.accounts.some((a) => a.clientId === c.id) && (
            <div className="panel">
              <p className="muted">
                Add the first social account for {c.name}.
              </p>
              <button
                className="btn secondary"
                onClick={() => openForm("account", null, { clientId: c.id })}
              >
                <Plus size={15} /> Add account
              </button>
            </div>
          )}
        </section>
      ))}
      {!data.clients.length && (
        <Empty
          icon={Users}
          title="Start with a brand"
          description="Create a client, then connect its accounts to campaigns."
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
function CalendarView({ state, data, openForm, openPost }) {
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("month");
  const base = new Date(month + "-01T12:00:00");
  const shift = (n) => {
    const d = new Date(base);
    d.setMonth(d.getMonth() + n);
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const first = new Date(base);
  first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(first);
    d.setDate(d.getDate() + i);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const posts = data.posts.filter(
    (p) => filter === "all" || p.status === filter,
  );
  const agenda = posts
    .filter((p) => p.date.startsWith(month))
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <PageHeading
        title="Make space for the next good idea."
        description="Plan the outline. Prepare the content. Learn after it goes live."
        eyebrow="CONTENT CALENDAR"
      >
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
            <option value="executed">Executed / live</option>
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
          Content ready
        </span>
        <span>
          <i className="readiness-dot in-progress" />
          In progress
        </span>
        <span>
          <i className="readiness-dot needed" />
          Need to create
        </span>
        <span>
          <Check size={13} />
          Executed
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
                  <span>{Number(d.slice(-2))}</span>
                  <button
                    aria-label={`Plan content on ${d}`}
                    onClick={() => openForm("post", null, { date: d })}
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
          {agenda.map((p) => (
            <div className="agenda-row" key={p.id}>
              <span className="agenda-date">
                {niceDate(p.date, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <PostCard post={p} state={state} onClick={openPost} />
              <Badge tone={STATUS_TONE[p.status]}>{titleCase(p.status)}</Badge>
            </div>
          ))}
          {!agenda.length && (
            <Empty
              icon={CalendarDays}
              title="A fresh page for your ideas"
              description="No content planned for this month."
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
function PostDetail({ post: p, state, openForm, mutate, onClose, askCodex }) {
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
        <Badge tone={STATUS_TONE[p.status]}>{titleCase(p.status)}</Badge>
        <Badge tone={STATUS_TONE[p.readiness]}>
          {p.readiness === "needed"
            ? "Content needed"
            : p.readiness === "ready"
              ? "Content ready"
              : "In progress"}
        </Badge>
      </div>
      <div className="detail-meta">
        <div>
          <span>Planned date</span>
          <strong>{niceDate(p.date)}</strong>
        </div>
        <div>
          <span>Campaign</span>
          <strong>{campaign?.name}</strong>
        </div>
        {strategy && (
          <div>
            <span>Strategy</span>
            <strong>{strategy.name}</strong>
          </div>
        )}
        <div>
          <span>Follow-up</span>
          <strong>
            {p.status === "executed"
              ? niceDate(
                  addDays(p.executedAt || p.date, p.reviewAfterDays || 7),
                )
              : `${p.reviewAfterDays || 7} days after execution`}
          </strong>
        </div>
      </div>
      <div className="post-outline">
        <h3>The outline</h3>
        <p>
          {p.notes ||
            "No notes yet. Add the creative direction or assets you need."}
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
      <div className="post-metric-list">
        <h3>Recorded results</h3>
        {state.metrics
          .filter((m) => m.postId === p.id)
          .map((m) => (
            <div key={m.id}>
              <span>{account?.kpis.find((k) => k.id === m.kpiId)?.name}</span>
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
          Edit plan
        </button>
        <button
          className="btn secondary"
          onClick={() =>
            openForm("metric", null, {
              accountId: p.accountId,
              kpiId: account?.kpis[0]?.id || "",
              campaignId: p.campaignId,
              strategyId: p.strategyId || "",
              postId: p.id,
            })
          }
        >
          <Plus size={15} /> Add result
        </button>
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
            <ClipboardCheck size={15} /> Assess content
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
            Cancel this plan
          </button>
          <button
            className="btn primary"
            disabled={b}
            onClick={() => change("executed")}
          >
            <Check size={16} /> Mark as executed
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
            Return to planned
          </button>
        </div>
      )}
    </Dialog>
  );
}
function DataView({ state, data, clientId, openForm, onState, onToast }) {
  const [tab, setTab] = useState("import");
  const [metricAccount, setMetricAccount] = useState("all");
  const filtered = state.metrics
    .filter(
      (m) =>
        data.accounts.some((a) => a.id === m.accountId) &&
        (metricAccount === "all" || m.accountId === metricAccount),
    )
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <>
      <PageHeading
        title="Bring the numbers together."
        description="Manual observations, exported reports, or attachments in your Codex chat."
        eyebrow="DATA & IMPORTS"
      >
        <a className="btn secondary" href="/api/export" download>
          <Download size={16} /> Export workspace
        </a>
        <button className="btn primary" onClick={() => openForm("metric")}>
          <Plus size={16} /> Record metric
        </button>
      </PageHeading>
      <div className="tabs">
        <button
          className={tab === "import" ? "selected" : ""}
          onClick={() => setTab("import")}
        >
          Import a report
        </button>
        <button
          className={tab === "history" ? "selected" : ""}
          onClick={() => setTab("history")}
        >
          Metric history <span>{filtered.length}</span>
        </button>
        <button
          className={tab === "activity" ? "selected" : ""}
          onClick={() => setTab("activity")}
        >
          Workspace activity
        </button>
      </div>
      {tab === "import" && (
        <ImportPanel
          state={state}
          onState={onState}
          onToast={onToast}
          clientId={clientId}
        />
      )}{" "}
      {tab === "history" && (
        <section className="panel">
          <PanelHeader
            title="Recorded observations"
            description="Each row is a dated snapshot, not an automatically accumulated total."
            action={
              <select
                aria-label="Filter metric history by account"
                value={metricAccount}
                onChange={(e) => setMetricAccount(e.target.value)}
              >
                <option value="all">All accounts</option>
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.handle} · {a.platform}
                  </option>
                ))}
              </select>
            }
          />
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
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
                {filtered.slice(0, 200).map((m) => {
                  const a = state.accounts.find((a) => a.id === m.accountId);
                  const k = a?.kpis.find((k) => k.id === m.kpiId);
                  return (
                    <tr key={m.id}>
                      <td>{niceDate(m.date)}</td>
                      <td>
                        <span className="table-account">
                          <Platform platform={a?.platform} size={14} />
                          {a?.handle}
                        </span>
                      </td>
                      <td>{k?.name}</td>
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
                            : "Account total"}
                      </td>
                      <td>{m.source || "manual"}</td>
                      <td>
                        <button
                          className="icon-btn"
                          aria-label={`Edit metric ${m.id}`}
                          onClick={() => openForm("metric", m)}
                        >
                          <Settings2 size={15} />
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
              title="No metrics recorded"
              description="Add your first observation or import a report."
            />
          )}
          {filtered.length > 200 && (
            <p className="muted small">
              Showing the latest 200. Export the workspace for the full history.
            </p>
          )}
        </section>
      )}
      {tab === "activity" && (
        <section className="panel">
          <PanelHeader
            title="Workspace activity"
            description="Recent changes saved to this folder."
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
          Your workspace is stored in <code>data/workspace.json</code>. Every
          successful save creates a backup. For chat imports, attach your report
          and ask Codex to inspect the columns and import the relevant metrics.
        </span>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")).render(<App />);
