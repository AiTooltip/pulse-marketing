import { useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { Dialog, Field, uid } from "./components.jsx";
import TacticPicker, { pendingTacticOps } from "./TacticPicker.jsx";
import { today } from "../shared/domain.mjs";

/** Quick add of a video that is already uploaded: name, upload date, strategy used. */
export default function UploadedVideo({
  state,
  clientId,
  prefill,
  onSaveMany,
  onClose,
  openResults,
}) {
  const inScope = (id) => clientId === "all" || !clientId || id === clientId;
  const campaigns = state.campaigns.filter((c) => inScope(c.clientId));
  const [name, setName] = useState("");
  const [date, setDate] = useState(prefill.date || today());
  const [strategyId, setStrategyId] = useState(prefill.strategyId || "");
  const [strategyLater, setStrategyLater] = useState(false);
  // A video does not have to be part of a campaign.
  const [campaignId, setCampaignId] = useState(prefill.campaignId || "");
  const [accountId, setAccountId] = useState(prefill.accountId || "");
  const [url, setUrl] = useState("");
  const [tacticIds, setTacticIds] = useState(prefill.tacticIds || []);
  const [pendingTactics, setPendingTactics] = useState([]);
  const [tacticsLater, setTacticsLater] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const campaign = state.campaigns.find((c) => c.id === campaignId);
  const accounts = state.accounts.filter((a) =>
    campaign ? a.clientId === campaign.clientId : inScope(a.clientId),
  );
  const account =
    accounts.find((a) => a.id === accountId) ||
    accounts.find((a) => /youtube/i.test(a.platform)) ||
    accounts[0];
  const strategies = state.strategies.filter((s) =>
    campaign
      ? s.campaignId === campaign.id
      : state.campaigns.find((c) => c.id === s.campaignId)?.clientId ===
        account?.clientId,
  );

  const save = async (thenAddResults) => {
    setError("");
    if (!name.trim()) return setError("Give the video a name.");
    if (!date || date > today())
      return setError("Enter the date it was uploaded (not in the future).");
    if (!account) return setError("This client has no social account yet.");
    if (url && !/^https?:\/\//i.test(url))
      return setError("The link must start with http:// or https://.");
    const post = {
      id: uid("post"),
      ...(campaign ? { campaignId: campaign.id } : {}),
      accountId: account.id,
      ...(strategyId ? { strategyId } : {}),
      ...(strategyLater && !strategyId ? { strategyLater: true } : {}),
      ...(tacticIds.length ? { tacticIds } : {}),
      ...(tacticsLater && !tacticIds.length ? { tacticsLater: true } : {}),
      title: name.trim(),
      format: "Video",
      date,
      status: "executed",
      executedAt: date,
      readiness: "ready",
      notes: "",
      url: url.trim(),
      reviewAfterDays: state.settings?.postReviewDays || 7,
    };
    setBusy(true);
    try {
      await onSaveMany([
        ...pendingTacticOps(pendingTactics, tacticIds),
        { op: "upsert", collection: "posts", value: post },
      ]);
      onClose();
      if (thenAddResults) openResults(post);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog
      title="Add a published video"
      description="Put a video that is already live on the calendar. Its numbers are optional: add them now or any time later from the video."
      onClose={onClose}
    >
      {!campaigns.length ? (
        <p className="muted">Create a campaign first, then add videos to it.</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save(false);
          }}
        >
          <div className="form-grid">
            <Field label="Video name" wide>
              <input
                autoFocus
                value={name}
                placeholder="Name of the YouTube video"
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
            <Field label="Uploaded on">
              <input
                type="date"
                max={today()}
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
            <Field label="Account">
              <select
                value={account?.id || ""}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.handle} · {a.platform}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Campaign (optional)"
              hint="Leave on No campaign if this video is not part of one."
            >
              <select
                value={campaignId}
                onChange={(e) => {
                  setCampaignId(e.target.value);
                  setStrategyId("");
                }}
              >
                <option value="">No campaign</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Strategy used (optional)"
              hint="Linking a strategy lets you compare it with other videos later."
            >
              <select
                value={strategyLater ? "__later__" : strategyId}
                onChange={(e) => {
                  const v = e.target.value;
                  setStrategyLater(v === "__later__");
                  setStrategyId(v === "__later__" ? "" : v);
                }}
              >
                <option value="">No strategy</option>
                <option value="__later__">Add later (remind me)</option>
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {campaign
                      ? ""
                      : ` · ${state.campaigns.find((c) => c.id === s.campaignId)?.name}`}
                  </option>
                ))}
              </select>
            </Field>
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
            <Field label="Video link (optional)">
              <input
                value={url}
                placeholder="https://youtube.com/watch?v=…"
                onChange={(e) => setUrl(e.target.value)}
              />
            </Field>
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
            <button
              type="button"
              className="btn secondary"
              disabled={busy}
              onClick={() => save(true)}
            >
              Save &amp; add results now
            </button>
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} />
              ) : (
                <Check size={16} />
              )}{" "}
              Save to calendar
            </button>
          </div>
        </form>
      )}
    </Dialog>
  );
}
