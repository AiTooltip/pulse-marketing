import { useState } from "react";
import { Plus, X } from "lucide-react";
import { uid } from "./components.jsx";
import { CATEGORIES, SUGGESTED_TACTICS } from "./suggestions.js";
import { tacticLifecycle } from "../shared/analysis.mjs";

/**
 * Choose the tactics used in a video from a dropdown, like the strategy field:
 * none, add later, one of yours, a new one, or a suggestion. Several can be added;
 * they appear as chips you can remove. New names are kept as `pending` and saved
 * together with the video.
 */
export default function TacticPicker({ state, value, onChange, pending, setPending, later, setLater }) {
  const [creating, setCreating] = useState(false);
  const [text, setText] = useState("");
  const lower = (s) => s.trim().toLowerCase();
  const all = [...state.tactics, ...pending];
  const byId = (id) => all.find((t) => t.id === id);
  // Adopted first (your standard tactics), then proven, then the rest; paused last.
  const order = { adopted: 0, proven: 1, promising: 2, testing: 3, idea: 4, paused: 5 };
  const rank = (t) => order[tacticLifecycle(state, t).status] ?? 4;
  const mine = [...state.tactics, ...pending]
    .filter((t) => !value.includes(t.id))
    .sort((a, b) => rank(a) - rank(b));
  const ideas = SUGGESTED_TACTICS.filter((s) => !all.some((t) => lower(t.name) === lower(s.name)));

  const add = (id) => {
    if (!value.includes(id)) onChange([...value, id]);
    setLater?.(false);
  };
  const addNew = (name, category) => {
    const clean = name.trim();
    if (!clean) return;
    const known = all.find((t) => lower(t.name) === lower(clean));
    if (known) add(known.id);
    else {
      const t = { id: uid("tactic"), name: clean, ...(category ? { category } : {}) };
      setPending([...pending, t]);
      onChange([...value, t.id]);
      setLater?.(false);
    }
    setText("");
    setCreating(false);
  };
  const choose = (v) => {
    if (!v) return;
    if (v === "__none__") {
      onChange([]);
      setLater?.(false);
      setCreating(false);
    } else if (v === "__later__") {
      onChange([]);
      setLater?.(true);
      setCreating(false);
    } else if (v === "__new__") setCreating(true);
    else if (v.startsWith("__sug__")) {
      const s = ideas[Number(v.slice(7))];
      if (s) addNew(s.name, s.category);
    } else add(v);
  };

  return (
    <div className="tactic-picker">
      <select aria-label="Add a tactic" value="" onChange={(e) => choose(e.target.value)}>
        <option value="">
          {value.length ? "Add another tactic…" : "Choose a tactic…"}
        </option>
        <option value="__none__">None (no tactics)</option>
        {setLater && <option value="__later__">Add later (remind me)</option>}
        {mine.length > 0 && (
          <optgroup label="Your tactics">
            {mine.map((t) => (
              <option key={t.id} value={t.id}>
                {tacticLifecycle(state, t).status === "adopted" ? "★ " : ""}
                {t.name}
              </option>
            ))}
          </optgroup>
        )}
        <option value="__new__">+ New tactic…</option>
        {CATEGORIES.map(([id, label]) => {
          const list = ideas.map((s, i) => [s, i]).filter(([s]) => s.category === id);
          return list.length ? (
            <optgroup key={id} label={`Suggested · ${label}`}>
              {list.map(([s, i]) => (
                <option key={s.name} value={`__sug__${i}`}>
                  {s.name}
                </option>
              ))}
            </optgroup>
          ) : null;
        })}
      </select>

      {creating && (
        <div className="chip-add">
          <input
            autoFocus
            aria-label="New tactic name"
            placeholder="e.g. Call to action within the first 2 minutes"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addNew(text);
              }
            }}
          />
          <button type="button" className="btn ghost small" disabled={!text.trim()} onClick={() => addNew(text)}>
            <Plus size={14} /> Add &amp; save
          </button>
        </div>
      )}

      <div className="chip-row">
        {value.map((id) => (
          <span className="chip on tactic-chip" key={id}>
            {byId(id)?.name || "Tactic"}
            <button
              type="button"
              className="chip-remove"
              aria-label={`Remove ${byId(id)?.name || "tactic"}`}
              onClick={() => onChange(value.filter((x) => x !== id))}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        {!value.length && later && <span className="muted small">Add later: you will be reminded to tag this video&apos;s tactics.</span>}
        {!value.length && !later && <span className="muted small">None chosen.</span>}
      </div>
      <p className="muted small">
        Pick as many as you like, one at a time. For cleaner comparisons later, try testing just 2 or 3 per video.
      </p>
    </div>
  );
}

/** Ops that create the pending tactics that are actually selected. */
export const pendingTacticOps = (pending, selectedIds) =>
  pending
    .filter((t) => selectedIds.includes(t.id))
    .map((t) => ({ op: "upsert", collection: "tactics", value: t }));
