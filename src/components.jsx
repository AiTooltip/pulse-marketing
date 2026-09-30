import React, { useEffect, useRef } from "react";
import {
  X,
  Plus,
  ArrowUpRight,
  Instagram,
  Linkedin,
  Video,
  Check,
  AlertCircle,
  CalendarDays,
  ArrowRight,
  Sparkles,
  Activity,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
} from "recharts";
export const uid = (prefix = "id") =>
  `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
export const fmt = (n, unit = "") =>
  `${new Intl.NumberFormat("en", { maximumFractionDigits: 1, notation: Math.abs(n) >= 10000 ? "compact" : "standard" }).format(Number(n) || 0)}${unit === "%" ? "%" : ""}`;
export const niceDate = (d, opts = { month: "short", day: "numeric" }) =>
  d
    ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en", opts)
    : "No date";
export const clamp = (n) => Math.max(0, Math.min(100, n));
export const titleCase = (s) =>
  s?.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase());
export function Badge({ children, tone = "", className = "" }) {
  return <span className={`badge ${tone} ${className}`}>{children}</span>;
}
export function Platform({ platform, size = 17 }) {
  return (
    <span className={`platform ${platform?.toLowerCase()}`} title={platform}>
      {platform === "Instagram" ? (
        <Instagram size={size} />
      ) : platform === "LinkedIn" ? (
        <Linkedin size={size} />
      ) : platform === "TikTok" ? (
        <span className="tiktok">♪</span>
      ) : (
        <Video size={size} />
      )}
    </span>
  );
}
export function Avatar({ client, size = "" }) {
  return (
    <span
      className={`avatar ${size}`}
      style={{ background: client?.color || "#718772" }}
    >
      {client?.name
        ?.split(" ")
        .filter((s) => s !== "&")
        .map((s) => s[0])
        .slice(0, 2)
        .join("") || "P"}
    </span>
  );
}
export function Empty({
  icon: Icon = Activity,
  title = "Nothing here yet",
  description,
  action,
}) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <Icon size={25} />
      </span>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
export function PanelHeader({ eyebrow, title, description, action }) {
  return (
    <div className="panel-heading">
      <div>
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h2>{title}</h2>
        {description && <p className="muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}
export function Sparkline({ values = [], color = "#6c947b" }) {
  if (!values.length) return null;
  let list = values.length > 1 ? values : [0, 0];
  let min = Math.min(...list),
    max = Math.max(...list);
  let path = list
    .map(
      (v, i) =>
        `${(i * 100) / (list.length - 1)},${35 - ((v - min) / (max - min || 1)) * 29}`,
    )
    .join(" ");
  return (
    <svg
      className="sparkline"
      viewBox="0 0 100 40"
      role="img"
      aria-label="Metric trend"
    >
      <polyline
        points={path}
        fill="none"
        stroke={color}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
export function TrendChart({
  history = [],
  target,
  unit = "",
  height = 230,
  color = "#668873",
  baseline,
}) {
  return (
    <div className="chart" style={{ height, minWidth: 0 }}>
      {history.length ? (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={history}
            margin={{ top: 12, right: 20, bottom: 0, left: 2 }}
          >
            <defs>
              <linearGradient
                id={`fill-${color.replace("#", "")}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                <stop offset="100%" stopColor={color} stopOpacity={0.01} />
              </linearGradient>
            </defs>
            <CartesianGrid
              vertical={false}
              stroke="#edf0ed"
              strokeDasharray="3 4"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(d) => niceDate(d)}
              axisLine={false}
              tickLine={false}
              minTickGap={35}
              tick={{ fill: "#828a86", fontSize: 12 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmt(v, unit)}
              tick={{ fill: "#828a86", fontSize: 12 }}
              width={51}
              domain={["auto", "auto"]}
            />
            <Tooltip
              labelFormatter={(d) => niceDate(d)}
              formatter={(v) => [fmt(v, unit), "Recorded"]}
              contentStyle={{
                border: "1px solid #e4e9e4",
                borderRadius: 10,
                fontSize: 13,
              }}
            />
            {target !== undefined && (
              <ReferenceLine
                y={target}
                ifOverflow="extendDomain"
                stroke="#b89d62"
                strokeDasharray="5 5"
                label={{
                  value: "TARGET",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#9a8153",
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2.5}
              fill={`url(#fill-${color.replace("#", "")})`}
              activeDot={{ r: 5 }}
              dot={history.length < 3}
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <Empty
          title="Your first data point starts here"
          description="Record a metric or import a report to see the trend."
        />
      )}
    </div>
  );
}
export function ProgressRing({
  value = 0,
  size = 64,
  color = "#78917b",
  label,
}) {
  const r = 40,
    c = 2 * Math.PI * r;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg
        viewBox="0 0 100 100"
        aria-label={`${Math.round(value)}% progress`}
        role="img"
      >
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#eef1ec"
          strokeWidth="7"
        />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(c * clamp(value)) / 100} ${c}`}
          transform="rotate(-90 50 50)"
        />
      </svg>
      <span>{label ?? `${Math.round(value)}%`}</span>
    </div>
  );
}
export function Dialog({
  title,
  description,
  children,
  onClose,
  wide = false,
}) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    el.addEventListener("keydown", handler);
    return () => el.removeEventListener("keydown", handler);
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      onClick={(e) => {
        if (e.target === ref.current) {
          const b = e.target.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            onClose();
        }
      }}
    >
      <div className="dialog-heading">
        <div>
          <h2>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({ label, children, hint, wide = false }) {
  return (
    <label className={`field ${wide ? "span-2" : ""}`}>
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function StatCard({ icon: Icon, label, value, sub, values, color }) {
  return (
    <div className="stat-card">
      <div className="stat-label">
        <span>{label}</span>
        <Icon size={17} />
      </div>
      <div className="stat-body">
        <strong>{value}</strong>
        {values?.length > 1 && <Sparkline values={values} color={color} />}
      </div>
      <div className="stat-foot">{sub}</div>
    </div>
  );
}
export function PostCard({ post, state, onClick, compact = false }) {
  const account = state.accounts.find((a) => a.id === post.accountId);
  const client = state.clients.find((c) => c.id === account?.clientId);
  return (
    <button
      className={`post-card ${compact ? "compact" : ""} ${post.status}`}
      onClick={() => onClick(post)}
      style={{ "--client-color": client?.color || "#779078" }}
    >
      <div className="post-card-top">
        <span className="format-label">{post.format}</span>
        <Platform platform={account?.platform} size={14} />
      </div>
      <strong>{post.title}</strong>
      <div className="post-card-bottom">
        <span>{client?.name}</span>
        {post.status === "executed" ? (
          <Check size={13} />
        ) : post.readiness === "ready" ? (
          <span className="ready-dot" title="Content ready" />
        ) : post.readiness === "needed" ? (
          <span className="needs-dot" title="Content needed" />
        ) : null}
      </div>
    </button>
  );
}
export function CodexPrompt({ prompt, onClose }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Dialog
      title="Continue with Codex"
      description="Your marketing context is already in this project folder."
      onClose={onClose}
    >
      <div className="codex-prompt">
        <Sparkles size={23} />
        <p>{prompt}</p>
      </div>
      <p className="muted small">
        Copy this request into the Codex chat connected to this folder. Codex
        can read your results, explain patterns, and save an insight or a new
        experiment here.
      </p>
      <div className="dialog-footer">
        <button className="btn secondary" onClick={onClose}>
          Close
        </button>
        <button
          className="btn primary"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(prompt);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check size={16} /> : <Sparkles size={16} />}{" "}
          {copied ? "Copied to clipboard" : "Copy request"}
        </button>
      </div>
    </Dialog>
  );
}
