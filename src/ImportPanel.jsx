import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Upload,
  X,
} from "lucide-react";

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const SAMPLE_CSV =
  "date,value\n2026-09-01,1200\n2026-09-08,1380\n2026-09-15,1525\n";

function cellText(value) {
  if (value === null || value === undefined) return "—";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

function fileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () =>
      reject(new Error("This file could not be read. Please choose it again."));
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.readAsDataURL(file);
  });
}

async function request(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body.error === "string"
        ? body.error
        : body.error?.message || body.message;
    const error = new Error(
      message || `The request could not be completed (${response.status}).`,
    );
    error.status = response.status;
    error.details = body.details;
    throw error;
  }
  return body;
}

function guessColumn(columns, candidates) {
  return (
    columns.find((column) =>
      candidates.includes(column.trim().toLowerCase()),
    ) || ""
  );
}

export default function ImportPanel({
  state,
  onState,
  onToast,
  clientId = "all",
}) {
  const [source, setSource] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dateColumn, setDateColumn] = useState("");
  const [valueColumn, setValueColumn] = useState("");
  const [accountId, setAccountId] = useState("");
  const [kpiId, setKpiId] = useState("");
  const [campaignId, setCampaignId] = useState("");
  const [strategyId, setStrategyId] = useState("");
  const [postId, setPostId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef(null);

  const accounts = (state.accounts || []).filter(
    (account) => clientId === "all" || account.clientId === clientId,
  );
  const account = accounts.find((item) => item.id === accountId);
  const kpis = account?.kpis || [];
  const kpi = kpis.find((item) => item.id === kpiId);
  const campaigns = (state.campaigns || []).filter(
    (item) => item.clientId === account?.clientId,
  );
  const strategies = (state.strategies || []).filter(
    (item) => item.campaignId === campaignId,
  );
  const posts = (state.posts || []).filter(
    (item) =>
      item.accountId === accountId &&
      item.campaignId === campaignId &&
      (!strategyId || item.strategyId === strategyId),
  );
  const campaign = campaigns.find((item) => item.id === campaignId);
  const strategy = strategies.find((item) => item.id === strategyId);
  const post = posts.find((item) => item.id === postId);
  const columns = preview?.columns || [];
  const rows = (preview?.rows || []).slice(0, 100);

  // Keep imports within valid client, account and attribution scopes after live state changes.
  useEffect(() => {
    if (!account) {
      setAccountId("");
      setKpiId("");
      setCampaignId("");
      setStrategyId("");
      setPostId("");
      return;
    }
    if (!kpis.some((item) => item.id === kpiId)) setKpiId("");
    if (campaignId && !campaigns.some((item) => item.id === campaignId)) {
      setCampaignId("");
      setStrategyId("");
      setPostId("");
    } else if (
      strategyId &&
      !strategies.some((item) => item.id === strategyId)
    ) {
      setStrategyId("");
      setPostId("");
    } else if (postId && !posts.some((item) => item.id === postId)) {
      setPostId("");
    }
  }, [state, clientId, accountId, kpiId, campaignId, strategyId, postId]);

  const mappingReady = Boolean(
    preview &&
    rows.length &&
    account &&
    kpi &&
    dateColumn &&
    valueColumn &&
    dateColumn !== valueColumn &&
    (!campaignId || campaign) &&
    (!strategyId || strategy) &&
    (!postId || post),
  );

  function clearImport() {
    setSource(null);
    setPreview(null);
    setDateColumn("");
    setValueColumn("");
    setError("");
    setResult(null);
    if (fileInput.current) fileInput.current.value = "";
  }

  async function chooseFile(file) {
    if (!file || busy) return;
    clearImport();
    if (!/\.(csv|xlsx)$/i.test(file.name)) {
      setError("Choose a CSV (.csv) or Excel workbook (.xlsx).");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(
        "This file is larger than 8 MB. Export a smaller CSV or Excel workbook.",
      );
      return;
    }
    if (!file.size) {
      setError(
        "This file is empty. Choose a file with a header row and metric observations.",
      );
      return;
    }
    setBusy("preview");
    try {
      const nextSource = {
        filename: file.name,
        content: await fileContent(file),
      };
      const nextPreview = await request("/api/import/preview", nextSource);
      setSource(nextSource);
      setPreview(nextPreview);
      setDateColumn(
        guessColumn(nextPreview.columns, [
          "date",
          "day",
          "report date",
          "reporting date",
        ]),
      );
      setValueColumn(
        guessColumn(nextPreview.columns, ["value", "metric", "count", "total"]),
      );
    } catch (failure) {
      setError(failure.message || "Unable to preview this file.");
    } finally {
      setBusy("");
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function chooseSheet(sheet) {
    if (!source || busy || sheet === preview?.sheet) return;
    setBusy("sheet");
    setError("");
    setResult(null);
    try {
      const nextPreview = await request("/api/import/preview", {
        ...source,
        sheet,
      });
      setPreview(nextPreview);
      setDateColumn((current) =>
        nextPreview.columns.includes(current)
          ? current
          : guessColumn(nextPreview.columns, [
              "date",
              "day",
              "report date",
              "reporting date",
            ]),
      );
      setValueColumn((current) =>
        nextPreview.columns.includes(current)
          ? current
          : guessColumn(nextPreview.columns, [
              "value",
              "metric",
              "count",
              "total",
            ]),
      );
    } catch (failure) {
      setError(failure.message || "Unable to preview this sheet.");
    } finally {
      setBusy("");
    }
  }

  async function commitImport(event) {
    event.preventDefault();
    if (!mappingReady || busy) return;
    setBusy("commit");
    setError("");
    setResult(null);
    try {
      const imported = await request("/api/import/commit", {
        revision: state.revision,
        ...source,
        sheet: preview.sheet,
        mapping: { date: dateColumn, value: valueColumn },
        accountId,
        kpiId,
        ...(campaignId ? { campaignId } : {}),
        ...(strategyId ? { strategyId } : {}),
        ...(postId ? { postId } : {}),
      });
      onState(imported.state);
      setResult({
        imported: imported.imported,
        skipped: imported.skipped,
        account: account.name || account.handle,
        kpi: kpi.name,
      });
      onToast(
        `${imported.imported} metric observation${imported.imported === 1 ? "" : "s"} imported${imported.skipped ? ` · ${imported.skipped} duplicate${imported.skipped === 1 ? "" : "s"} skipped` : ""}.`,
      );
    } catch (failure) {
      if (failure.status === 409) {
        try {
          const latest = await fetch("/api/state");
          if (!latest.ok) throw new Error("Could not refresh");
          onState(await latest.json());
          setError(
            "The workspace changed while you were preparing this import. The latest data is now loaded. Review your selections, then import again.",
          );
        } catch {
          setError(
            "The workspace changed while you were preparing this import. Refresh the page before trying again.",
          );
        }
      } else {
        const details = Array.isArray(failure.details)
          ? failure.details.slice(0, 8).map(cellText).join(" · ")
          : "";
        setError(
          `${failure.message || "The import could not be completed."}${details ? ` ${details}` : ""} No rows were imported.`,
        );
      }
    } finally {
      setBusy("");
    }
  }

  function editMapping(setter, value) {
    setter(value);
    setResult(null);
    setError("");
  }

  return (
    <div className="import-workflow" style={{ display: "grid", gap: 20 }}>
      <div
        className="panel"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div className="eyebrow">YOUR NUMBERS, CONNECTED</div>
          <h2 style={{ margin: "8px 0" }}>Bring your metrics into focus</h2>
          <p className="muted" style={{ margin: 0 }}>
            Map an exported CSV or Excel table to a social account and KPI.
            Files and imported data stay in your local workspace.
          </p>
        </div>
        <a
          className="btn secondary"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(SAMPLE_CSV)}`}
          download="marketing-metrics-sample.csv"
        >
          <Download size={16} /> Download sample CSV
        </a>
      </div>

      <div
        className="import-steps"
        aria-label="Import steps"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <span className="badge">1 · Choose a file</span>
        <ArrowRight size={14} aria-hidden="true" />
        <span className="badge">2 · Map your data</span>
        <ArrowRight size={14} aria-hidden="true" />
        <span className="badge">3 · Review & import</span>
      </div>

      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {result && (
        <div
          className="notice"
          role="status"
          style={{ display: "flex", alignItems: "center", gap: 12 }}
        >
          <CheckCircle2 size={22} aria-hidden="true" />
          <div>
            <strong>
              {result.imported} observation{result.imported === 1 ? "" : "s"}{" "}
              imported.
            </strong>{" "}
            {result.skipped} duplicate{result.skipped === 1 ? "" : "s"} skipped.
            Saved to {result.account} · {result.kpi} in the local workspace.
          </div>
        </div>
      )}

      <section className="panel" aria-labelledby="import-file-heading">
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 16,
          }}
        >
          <h3 id="import-file-heading" style={{ margin: 0 }}>
            01 <span className="muted">/</span> Source file
          </h3>
          {source && (
            <button
              type="button"
              className="btn ghost"
              onClick={clearImport}
              disabled={Boolean(busy)}
            >
              <X size={15} /> Clear file
            </button>
          )}
        </div>
        <div
          className={`import-dropzone${dragging ? " dragging" : ""}`}
          style={{
            border: `1px dashed ${dragging ? "var(--accent, #7d76f2)" : "var(--border, #dedee7)"}`,
            borderRadius: 14,
            padding: 28,
            textAlign: "center",
            background: "var(--surface-soft, rgba(128,128,160,.035))",
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (!busy) setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            if (!busy) chooseFile(event.dataTransfer.files?.[0]);
          }}
        >
          <FileSpreadsheet
            size={30}
            style={{ marginBottom: 10 }}
            aria-hidden="true"
          />
          <div>
            <strong>
              {source ? source.filename : "Drop your CSV or Excel export here"}
            </strong>
          </div>
          <p className="muted" style={{ margin: "8px 0 16px" }}>
            {busy === "preview"
              ? "Reading file and building your preview…"
              : "First row = column names · .csv or .xlsx · up to 8 MB"}
          </p>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.xlsx"
            aria-label="Choose metrics CSV or Excel file"
            onChange={(event) => chooseFile(event.target.files?.[0])}
            disabled={Boolean(busy)}
            style={{ display: "none" }}
          />
          <button
            type="button"
            className="btn secondary"
            onClick={() => fileInput.current?.click()}
            disabled={Boolean(busy)}
          >
            <Upload size={16} />{" "}
            {source ? "Choose another file" : "Choose file"}
          </button>
        </div>

        {preview && (
          <div style={{ marginTop: 20 }}>
            <div
              style={{
                display: "flex",
                alignItems: "end",
                justifyContent: "space-between",
                gap: 16,
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              {preview.sheets?.length > 1 ? (
                <label className="field" style={{ minWidth: 200 }}>
                  Workbook sheet
                  <select
                    value={preview.sheet}
                    onChange={(event) => chooseSheet(event.target.value)}
                    disabled={Boolean(busy)}
                  >
                    {preview.sheets.map((sheet) => (
                      <option key={sheet} value={sheet}>
                        {sheet}
                      </option>
                    ))}
                  </select>
                </label>
              ) : (
                <strong>{preview.sheet || "Table preview"}</strong>
              )}
              <span className="muted">
                {busy === "sheet"
                  ? "Loading sheet…"
                  : `${preview.totalRows.toLocaleString()} rows · ${columns.length} columns · showing ${rows.length}`}
              </span>
            </div>
            {rows.length ? (
              <div
                className="table-wrap"
                style={{ maxHeight: 320, overflow: "auto" }}
                tabIndex={0}
                aria-label="Source data preview"
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th scope="col">Row</th>
                      {columns.map((column, index) => (
                        <th scope="col" key={`${column}-${index}`}>
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, index) => (
                      <tr key={index}>
                        <td className="muted">{index + 2}</td>
                        {columns.map((column, columnIndex) => (
                          <td
                            key={`${column}-${columnIndex}`}
                            style={{ maxWidth: 260, overflowWrap: "anywhere" }}
                          >
                            {cellText(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="notice">
                This sheet has no data rows. Choose another sheet or a file with
                observations below the header.
              </div>
            )}
          </div>
        )}
      </section>

      {preview && rows.length > 0 && (
        <form onSubmit={commitImport} style={{ display: "grid", gap: 20 }}>
          <section className="panel" aria-labelledby="import-map-heading">
            <h3 id="import-map-heading" style={{ margin: "0 0 8px" }}>
              02 <span className="muted">/</span> Map your data
            </h3>
            <p className="muted" style={{ margin: "0 0 20px" }}>
              Import one KPI at a time. Map its date and value columns, then
              choose where the observations belong.
            </p>
            {!accounts.length && (
              <div className="notice" style={{ marginBottom: 16 }}>
                Add a social account and at least one KPI in Social accounts
                before importing metrics.
              </div>
            )}
            <fieldset
              disabled={Boolean(busy)}
              style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
            >
              <div className="form-grid">
                <label className="field">
                  Social account
                  <select
                    required
                    value={accountId}
                    onChange={(event) => {
                      editMapping(setAccountId, event.target.value);
                      setKpiId("");
                      setCampaignId("");
                      setStrategyId("");
                      setPostId("");
                    }}
                  >
                    <option value="">Choose an account</option>
                    {accounts.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name || item.handle} · {item.platform}
                        {clientId === "all"
                          ? ` · ${state.clients.find((client) => client.id === item.clientId)?.name || ""}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  KPI
                  <select
                    required
                    value={kpiId}
                    onChange={(event) =>
                      editMapping(setKpiId, event.target.value)
                    }
                    disabled={!account}
                  >
                    <option value="">
                      {account && !kpis.length
                        ? "Add a KPI to this account first"
                        : "Choose a KPI"}
                    </option>
                    {kpis.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                        {item.unit ? ` (${item.unit})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  Date column
                  <select
                    required
                    value={dateColumn}
                    onChange={(event) =>
                      editMapping(setDateColumn, event.target.value)
                    }
                  >
                    <option value="">Choose a column</option>
                    {columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                  <small className="muted">
                    Use YYYY-MM-DD dates or native Excel dates.
                  </small>
                </label>
                <label className="field">
                  Value column
                  <select
                    required
                    value={valueColumn}
                    onChange={(event) =>
                      editMapping(setValueColumn, event.target.value)
                    }
                  >
                    <option value="">Choose a column</option>
                    {columns.map((column) => (
                      <option key={column} value={column}>
                        {column}
                      </option>
                    ))}
                  </select>
                  <small className="muted">
                    Numeric observations{kpi?.unit ? ` in ${kpi.unit}` : ""}.
                    Percentages use points: 4.5 means 4.5%. Excel percentage
                    cells are converted automatically; check the preview.
                  </small>
                </label>
              </div>
              {dateColumn && valueColumn === dateColumn && (
                <div className="notice error" style={{ marginTop: 14 }}>
                  Choose different columns for dates and values.
                </div>
              )}
              <div
                style={{
                  borderTop: "1px solid var(--border, #dedee7)",
                  marginTop: 24,
                  paddingTop: 20,
                }}
              >
                <strong>Optional attribution</strong>
                <p className="muted" style={{ margin: "6px 0 16px" }}>
                  Leave these blank for account snapshots, or connect the rows
                  to a campaign, strategy, or content item.
                </p>
                <div className="form-grid">
                  <label className="field">
                    Campaign
                    <select
                      value={campaignId}
                      onChange={(event) => {
                        editMapping(setCampaignId, event.target.value);
                        setStrategyId("");
                        setPostId("");
                      }}
                      disabled={!account}
                    >
                      <option value="">Account-level observation</option>
                      {campaigns.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Strategy
                    <select
                      value={strategyId}
                      onChange={(event) => {
                        editMapping(setStrategyId, event.target.value);
                        setPostId("");
                      }}
                      disabled={!campaignId}
                    >
                      <option value="">No strategy attribution</option>
                      {strategies.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    Content item
                    <select
                      value={postId}
                      onChange={(event) => {
                        editMapping(setPostId, event.target.value);
                        const selected = posts.find(
                          (item) => item.id === event.target.value,
                        );
                        if (selected?.strategyId)
                          setStrategyId(selected.strategyId);
                      }}
                      disabled={!campaignId}
                    >
                      <option value="">No content attribution</option>
                      {posts.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title} · {item.date}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            </fieldset>
          </section>

          <section className="panel" aria-labelledby="import-review-heading">
            <h3 id="import-review-heading" style={{ margin: "0 0 8px" }}>
              03 <span className="muted">/</span> Review & import
            </h3>
            {mappingReady ? (
              <>
                <p className="muted" style={{ margin: "0 0 16px" }}>
                  <strong>
                    {account.name || account.handle} → {kpi.name}
                  </strong>
                  {campaign ? ` · ${campaign.name}` : " · Account snapshots"}
                  {strategy ? ` · ${strategy.name}` : ""}
                  {post ? ` · ${post.title}` : ""}
                </p>
                <div className="table-wrap" style={{ overflow: "auto" }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th scope="col">Source row</th>
                        <th scope="col">Date ← {dateColumn}</th>
                        <th scope="col">
                          {kpi.name} ← {valueColumn}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 5).map((row, index) => (
                        <tr key={index}>
                          <td className="muted">{index + 2}</td>
                          <td>{cellText(row[dateColumn])}</td>
                          <td>
                            {cellText(row[valueColumn])}
                            {kpi.unit ? ` ${kpi.unit}` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="muted" style={{ margin: "14px 0 20px" }}>
                  Showing the first {Math.min(rows.length, 5)} mapped rows. All{" "}
                  {preview.totalRows.toLocaleString()} rows from the original
                  file will be validated before anything is saved. Exact
                  duplicates are skipped. Observations are snapshots, not totals
                  added across dates.
                </p>
              </>
            ) : (
              <p className="muted" style={{ margin: "0 0 20px" }}>
                Select an account, KPI, date column, and value column to preview
                your mapping.
              </p>
            )}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 16,
                flexWrap: "wrap",
              }}
            >
              <button
                type="submit"
                className="btn primary"
                disabled={!mappingReady || Boolean(busy) || Boolean(result)}
              >
                <Upload size={16} />{" "}
                {busy === "commit"
                  ? "Validating & importing…"
                  : result
                    ? "Import complete"
                    : `Import ${preview.totalRows.toLocaleString()} rows`}
              </button>
              {result && (
                <button
                  type="button"
                  className="btn secondary"
                  onClick={clearImport}
                >
                  Import another file
                </button>
              )}
              <span className="muted">
                Saved directly to your local workspace.
              </span>
            </div>
          </section>
        </form>
      )}
    </div>
  );
}
