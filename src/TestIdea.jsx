import { useState } from "react";
import { ArrowRight, FlaskConical, LoaderCircle } from "lucide-react";
import { Dialog, Field, uid } from "./components.jsx";
import { addDays, today } from "../shared/domain.mjs";

/**
 * Turns a saved best practice into a running experiment:
 * creates the strategy and (optionally) its first planned post, then hands off
 * to the content calendar.
 */
export default function TestIdea({ practice, state, clientId, onSaveMany, onClose, onDone }) {
  const sourceStrategy = state.strategies.find(
    (s) => s.id === practice.strategyId,
  );
  const owner = practice.clientId
    ? practice.clientId
    : state.campaigns.find((c) => c.id === sourceStrategy?.campaignId)?.clientId;
  const campaigns = state.campaigns.filter(
    (c) =>
      (owner ? c.clientId === owner : clientId === "all" || c.clientId === clientId) &&
      c.status !== "completed",
  );
  const options = campaigns.length ? campaigns : state.campaigns;
  const [campaignId, setCampaignId] = useState(
    (options.find((c) => c.id === sourceStrategy?.campaignId) || options[0])?.id || "",
  );
  const [name, setName] = useState(`Test: ${practice.title}`);
  const [hypothesis, setHypothesis] = useState(
    practice.explanation
      ? `We believe ${practice.explanation.charAt(0).toLowerCase()}${practice.explanation.slice(1)}`
      : `We believe “${practice.title}” will improve our results.`,
  );
  const [changes, setChanges] = useState(practice.nextTest || "");
  const [keep, setKeep] = useState("");
  const [days, setDays] = useState(7);
  const [plan, setPlan] = useState(true);
  const campaign = state.campaigns.find((c) => c.id === campaignId);
  const accounts = state.accounts.filter((a) => a.clientId === campaign?.clientId);
  const [accountId, setAccountId] = useState("");
  const [title, setTitle] = useState(`First test post: ${practice.title}`);
  const [format, setFormat] = useState("Reel");
  const [date, setDate] = useState(addDays(today(), 3));
  const [notes, setNotes] = useState(practice.nextTest || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const chosenAccount = accounts.find((a) => a.id === accountId) || accounts[0];
  const canPlan = Boolean(chosenAccount);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!campaign) return setError("Choose a campaign for this test.");
    const strategyId = uid("strategy");
    const ops = [
      {
        op: "upsert",
        collection: "strategies",
        value: {
          id: strategyId,
          campaignId,
          name: name.trim(),
          hypothesis,
          changes,
          keep,
          status: "testing",
          reviewEveryDays: Number(days),
          nextReviewDate: addDays(today(), Number(days)),
        },
      },
    ];
    let postId = null;
    if (plan && canPlan) {
      postId = uid("post");
      ops.push({
        op: "upsert",
        collection: "posts",
        value: {
          id: postId,
          campaignId,
          accountId: chosenAccount.id,
          strategyId,
          title: title.trim(),
          format,
          date,
          status: "planned",
          readiness: "needed",
          notes,
          url: "",
          reviewAfterDays: 7,
        },
      });
    }
    setBusy(true);
    try {
      await onSaveMany(ops);
      onDone({ strategyId, postId, date: plan && canPlan ? date : null });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      wide
      title="Test this idea"
      description="We will turn it into a strategy, then take you to the content plan to schedule the first post."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="idea-banner">
          <FlaskConical size={18} />
          <div>
            <strong>{practice.title}</strong>
            {practice.nextTest && <span>Suggested test: {practice.nextTest}</span>}
          </div>
        </div>
        <h3 className="wizard-subtitle">1 · The experiment</h3>
        <div className="form-grid">
          <Field label="Strategy name">
            <input required value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Campaign">
            <select
              value={campaignId}
              onChange={(e) => {
                setCampaignId(e.target.value);
                setAccountId("");
              }}
            >
              {options.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="What we believe will happen" wide>
            <textarea rows={2} value={hypothesis} onChange={(e) => setHypothesis(e.target.value)} />
          </Field>
          <Field label="The one thing we change">
            <textarea rows={2} value={changes} onChange={(e) => setChanges(e.target.value)} />
          </Field>
          <Field label="What stays the same">
            <textarea
              rows={2}
              value={keep}
              placeholder="e.g. same posting time and length"
              onChange={(e) => setKeep(e.target.value)}
            />
          </Field>
          <Field label="Check results after (days)">
            <input
              type="number"
              min="1"
              required
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </Field>
        </div>

        <label className="wizard-toggle" style={{ marginTop: 22 }}>
          <input type="checkbox" checked={plan} disabled={!canPlan} onChange={(e) => setPlan(e.target.checked)} />
          <span>
            <strong>2 · Plan the first post for this test</strong>
            <small>
              {canPlan
                ? "It will appear in your content plan, linked to this strategy."
                : "This client has no social account yet, so there is nothing to plan content on."}
            </small>
          </span>
        </label>
        {plan && canPlan && (
          <div className="form-grid">
            <Field label="Post idea" wide>
              <input required value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
            <Field label="Social account">
              <select value={chosenAccount.id} onChange={(e) => setAccountId(e.target.value)}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.handle} · {a.platform}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Format">
              <select value={format} onChange={(e) => setFormat(e.target.value)}>
                {["Reel", "Video", "Post", "Carousel", "Story", "Article"].map((f) => (
                  <option key={f}>{f}</option>
                ))}
              </select>
            </Field>
            <Field label="Planned date">
              <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
            <Field label="Outline / notes" wide>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        <div className="dialog-footer">
          <button type="button" className="btn secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy ? <LoaderCircle className="spin" size={16} /> : <ArrowRight size={16} />}{" "}
            {plan && canPlan ? "Start test and open content plan" : "Start test"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
