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
  Mail,
  Globe,
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
export const UNITS = [
  "count",
  "people",
  "views",
  "%",
  "minutes",
  "hours",
  "seconds",
  "h:m:s",
  "m:s",
  "$",
];
/** 1,234,567.89 style: commas for thousands, a dot for decimals. */
export const fmt = (n, unit = "") =>
  unit === DURATION
    ? formatDuration(n)
    : unit === DURATION_MS
      ? formatMinSec(n)
    : `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(Number(n) || 0)}${unit === "%" ? "%" : ""}`;
export const windowLabel = (days) =>
  !days
    ? "running total"
    : days === 1
      ? "per day"
      : days === 7
        ? "per week"
        : days === 30
          ? "per month"
          : `over ${days} days`;
const GOAL_PERIODS = [
  ["", "Running total (e.g. total followers)"],
  ["1", "Per day"],
  ["7", "Per week"],
  ["30", "Per month (30 days)"],
  ["custom", "Per another number of days…"],
];
const PERIODS = [
  ["", "Running total (as of date)"],
  ["1", "Over 1 day"],
  ["7", "Over 7 days (a week / first week)"],
  ["14", "Over 14 days"],
  ["30", "Over 30 days (a month)"],
  ["custom", "Over another number of days…"],
];
/** Is this number a running total, or what was gained over a window of days? */
export function PeriodSelect({ value, onChange, goal = false, ...props }) {
  const v = String(value ?? "");
  const options = goal ? GOAL_PERIODS : PERIODS;
  const preset = options.some(([k]) => k === v && k !== "custom");
  return (
    <>
      <select
        {...props}
        value={preset ? v : "custom"}
        onChange={(e) => onChange(e.target.value === "custom" ? "2" : e.target.value)}
      >
        {options.map(([k, label]) => (
          <option key={k} value={k}>
            {label}
          </option>
        ))}
      </select>
      {!preset && (
        <input
          type="number"
          min="1"
          max="3650"
          aria-label="Number of days"
          placeholder="Days"
          value={v}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </>
  );
}
export const DURATION = "h:m:s";
export const DURATION_MS = "m:s";
export const isDuration = (unit) => unit === DURATION || unit === DURATION_MS;
/** Minutes and seconds only: 230 → "3m 50s", 4500 → "75m 00s" (never hours). */
export function formatMinSec(totalSeconds) {
  const n = Number(totalSeconds);
  if (!Number.isFinite(n)) return "—";
  const s = Math.round(Math.abs(n));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${n < 0 ? "-" : ""}${m}m ${String(sec).padStart(2, "0")}s`;
}
/** 230 → "3m 50s", 3723 → "1h 02m 03s", 45 → "45s". Stored as plain seconds. */
export function formatDuration(totalSeconds) {
  const n = Number(totalSeconds);
  if (!Number.isFinite(n)) return "—";
  const neg = n < 0 ? "-" : "";
  const s = Math.round(Math.abs(n));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h) return `${neg}${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  if (m) return `${neg}${m}m ${String(sec).padStart(2, "0")}s`;
  return `${neg}${sec}s`;
}
/**
 * Read a typed duration into seconds. Accepts 3m50s, 3m 50s, 00h03m50s, 1h2m3s,
 * 3:50 (minutes:seconds), 1:03:50 (hours:minutes:seconds) and a bare number of seconds.
 */
export function parseDuration(text) {
  const t = String(text ?? "").trim().toLowerCase();
  if (!t) return null;
  let m = t.match(/^(\d+):([0-5]?\d)(?::([0-5]?\d))?$/);
  if (m)
    return m[3] === undefined
      ? Number(m[1]) * 60 + Number(m[2])
      : Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  m = t.match(/^(?:(\d+(?:\.\d+)?)\s*h)?\s*(?:(\d+(?:\.\d+)?)\s*m(?:in)?)?\s*(?:(\d+(?:\.\d+)?)\s*s(?:ec)?)?$/);
  if (m && (m[1] || m[2] || m[3]))
    return (
      Number(m[1] || 0) * 3600 + Number(m[2] || 0) * 60 + Number(m[3] || 0)
    );
  const plain = t.replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(plain) ? Number(plain) : null;
}
function DurationInput({ value, onChange, minSec = false, ...props }) {
  const show = minSec ? formatMinSec : formatDuration;
  const external = String(value ?? "");
  const [text, setText] = React.useState(() =>
    external === "" ? "" : show(external),
  );
  // Follow outside changes (prefill, pasted columns) but not our own typing.
  useEffect(() => {
    const own = parseDuration(text);
    if ((own === null ? "" : String(own)) !== external)
      setText(external === "" ? "" : show(external));
  }, [external]);
  const parsed = parseDuration(text);
  return (
    <span className="duration-input">
      <input
        {...props}
        type="text"
        inputMode="text"
        autoComplete="off"
        placeholder={props.placeholder || "e.g. 3m50s or 3:50"}
        value={text}
        aria-invalid={text.trim() !== "" && parsed === null}
        onChange={(e) => {
          setText(e.target.value);
          const p = parseDuration(e.target.value);
          onChange({ target: { value: p === null ? "" : String(p) } });
        }}
        onBlur={() => parsed !== null && setText(show(parsed))}
      />
      <small className={parsed === null && text.trim() ? "warn-text" : "muted"}>
        {text.trim() === ""
          ? minSec
            ? "Type 3m50s or 3:50 (minutes and seconds)"
            : "Type 3m50s, 3:50 or 1h02m03s"
          : parsed === null
            ? "Not understood. Try 3m50s or 3:50"
            : `= ${show(parsed)}`}
      </small>
    </span>
  );
}
const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** Number box that shows commas while you type; value stays a plain numeric string. */
export function NumInput({ value, onChange, unit, ...props }) {
  if (isDuration(unit))
    return (
      <DurationInput
        value={value}
        onChange={onChange}
        minSec={unit === DURATION_MS}
        {...props}
      />
    );
  const raw = String(value ?? "");
  const [int, dec] = raw.split(".");
  const shown =
    (int.startsWith("-") ? "-" : "") +
    group(int.replace("-", "")) +
    (dec !== undefined ? `.${dec}` : "");
  return (
    <input
      {...props}
      type="text"
      inputMode="decimal"
      value={shown}
      onChange={(e) => {
        let t = e.target.value.replace(/[^0-9.\-]/g, "");
        const neg = t.startsWith("-");
        t = t.replace(/-/g, "");
        const i = t.indexOf(".");
        if (i >= 0) t = t.slice(0, i + 1) + t.slice(i + 1).replace(/\./g, "");
        onChange({ target: { value: (neg ? "-" : "") + t } });
      }}
    />
  );
}
export const niceDate = (d, opts = { month: "short", day: "numeric" }) =>
  d
    ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString("en", opts)
    : "No date";
export const clamp = (n) => Math.max(0, Math.min(100, n));
export const titleCase = (s) =>
  s?.replaceAll("-", " ").replace(/^./, (c) => c.toUpperCase());
/** One name per state everywhere in the interface; stored values stay as they are. */
const STATUS_LABELS = { executed: "Published" };
export const statusLabel = (s) => STATUS_LABELS[s] || titleCase(s);
export const READINESS_LABELS = {
  needed: "To create",
  "in-progress": "In progress",
  ready: "Ready",
};
export const readinessLabel = (r) => READINESS_LABELS[r] || titleCase(r);
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
      ) : platform === "YouTube" ? (
        <Video size={size} />
      ) : /news|mail/i.test(platform || "") ? (
        <Mail size={size} />
      ) : /web|site|blog/i.test(platform || "") ? (
        <Globe size={size} />
      ) : (
        <span className="tiktok" style={{ fontSize: size }}>
          {(platform || "?").trim().charAt(0).toUpperCase()}
        </span>
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
  average,
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
              tick={{ fill: "#5f6b5d", fontSize: 12 }}
              dy={8}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => fmt(v, unit)}
              tick={{ fill: "#5f6b5d", fontSize: 12 }}
              width={51}
              domain={["auto", "auto"]}
            />
            <Tooltip
              labelFormatter={(d) => niceDate(d)}
              formatter={(v) => [fmt(v, unit), "Recorded value"]}
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
                  fill: "#7a6232",
                }}
              />
            )}
            {average !== undefined && (
              <ReferenceLine
                y={average}
                stroke="#8a948e"
                strokeDasharray="2 4"
                label={{
                  value: "AVG",
                  position: "insideBottomRight",
                  fontSize: 10,
                  fill: "#5f6b5d",
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
          title="No numbers recorded yet"
          description="Add a number or import a report to see the trend."
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
  const titleId = React.useId();
  const ref = useRef();
  // Once someone types into a form here, closing by Esc, the backdrop or ×
  // asks first, so a stray click never throws away their work.
  const edited = useRef(false);
  const [confirming, setConfirming] = React.useState(false);
  const requestClose = useRef();
  requestClose.current = () => {
    if (edited.current) setConfirming(true);
    else onClose();
  };
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    // Start typing straight away: focus the form's first text box, not the ×.
    if (!el.querySelector("[autofocus]")) {
      const first = el.querySelector(
        'form input:not([type]):not([disabled]), form input[type="text"]:not([disabled]), form input[type="url"], form input[type="date"]:not([disabled]), form input[type="number"]:not([disabled]), form textarea',
      );
      if (first && !first.value) first.focus();
    }
    const handler = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        requestClose.current();
      }
    };
    const onEdit = (e) => {
      if (e.target.closest?.("form")) edited.current = true;
    };
    el.addEventListener("keydown", handler);
    el.addEventListener("input", onEdit);
    el.addEventListener("change", onEdit);
    return () => {
      el.removeEventListener("keydown", handler);
      el.removeEventListener("input", onEdit);
      el.removeEventListener("change", onEdit);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? "wide" : ""}`}
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === ref.current) {
          const b = e.target.getBoundingClientRect();
          if (
            e.clientX < b.left ||
            e.clientX > b.right ||
            e.clientY < b.top ||
            e.clientY > b.bottom
          )
            requestClose.current();
        }
      }}
    >
      <div className="dialog-heading">
        <div>
          <h2 id={titleId}>{title}</h2>
          {description && <p className="muted">{description}</p>}
        </div>
        <button
          className="icon-btn"
          type="button"
          onClick={() => requestClose.current()}
          aria-label="Close"
        >
          <X size={20} />
        </button>
      </div>
      {confirming && (
        <div className="discard-bar" role="alert">
          <span>Close without saving your changes?</span>
          <button
            type="button"
            className="btn secondary small"
            autoFocus
            onClick={() => setConfirming(false)}
          >
            Keep editing
          </button>
          <button type="button" className="btn danger small" onClick={onClose}>
            Discard changes
          </button>
        </div>
      )}
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
export function StatCard({ icon: Icon, label, value, sub, values, color, onClick }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      className={`stat-card ${onClick ? "clickable" : ""}`}
      onClick={onClick}
      type={onClick ? "button" : undefined}
    >
      <div className="stat-label">
        <span>{label}</span>
        <Icon size={17} aria-hidden="true" />
      </div>
      <div className="stat-body">
        <strong>{value}</strong>
        {values?.length > 1 && <Sparkline values={values} color={color} />}
      </div>
      <div className="stat-foot">{sub}</div>
    </Tag>
  );
}
export function PostCard({ post, state, onClick, compact = false }) {
  const account = state.accounts.find((a) => a.id === post.accountId);
  const client = state.clients.find((c) => c.id === account?.clientId);
  const resultCount = state.metrics.filter((m) => m.postId === post.id).length;
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
      {resultCount > 0 && (
        <small className="muted result-count">
          {resultCount} result{resultCount === 1 ? "" : "s"} recorded
        </small>
      )}
      <div className="post-card-bottom">
        <span>{client?.name}</span>
        {post.status === "executed" ? (
          <span className="post-state" title="Published">
            <Check size={13} aria-hidden="true" />
            <span className="sr-only">Published</span>
          </span>
        ) : post.status === "cancelled" ? (
          <span className="sr-only">Cancelled</span>
        ) : (
          <span
            className={`readiness-dot ${post.readiness}`}
            title={`Content: ${readinessLabel(post.readiness).toLowerCase()}`}
          >
            <span className="sr-only">
              Content {readinessLabel(post.readiness).toLowerCase()}
            </span>
          </span>
        )}
      </div>
    </button>
  );
}
export function ClaudePrompt({ prompt, onClose }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <Dialog
      title="Ask Claude"
      description="Claude can read your workspace in this folder, so you only need to send the request below."
      onClose={onClose}
    >
      <div className="codex-prompt">
        <Sparkles size={23} />
        <p>{prompt}</p>
      </div>
      <p className="muted small">
        Copy this request and paste it into your Claude chat for this folder.
        Claude will read your saved results, explain what it finds, and can save
        a learning or a new test for you.
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
