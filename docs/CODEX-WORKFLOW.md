# Working with Pulse through chat and local commands

All commands run from the project folder. The server is local at `http://127.0.0.1:4310` unless `PORT` is set. The CLI verifies both the application marker and its folder identity before reading or writing, so another workspace on the same port is never used silently.

## A normal session

```sh
npm ci
npm start
```

Run `npm ci` only for initial setup or changed dependencies. Keep `npm start` running in one terminal and use another for commands:

```sh
node scripts/marketing.mjs brief
node scripts/marketing.mjs brief --json
node scripts/marketing.mjs state
```

The briefing is calculated from the saved state and current local day. It contains counts, due/upcoming reminders, active campaign goals, and strategies with observed metrics. It performs no writes and calls no AI service. The JSON output includes record IDs for follow-up actions.

For a second workspace on macOS/Linux:

```sh
PORT=4311 npm start
PORT=4311 node scripts/marketing.mjs brief
```

In Windows PowerShell:

```powershell
$env:PORT = '4311'
npm start
```

Set the same environment variable in any second terminal used for CLI commands. The app remains bound to `127.0.0.1`; changing the port does not expose it to the network.

## Make a validated change

First read state and choose the actual record IDs. Create a local JSON file such as `data/inbox/change.json`:

```json
{
  "revision": "COPY_THE_CURRENT_REVISION",
  "operations": [
    {
      "op": "upsert",
      "collection": "clients",
      "value": {
        "id": "client-cedar",
        "name": "Cedar Studio",
        "industry": "Design",
        "color": "#6f8060",
        "notes": "Independent furniture studio"
      }
    }
  ]
}
```

Then run:

```sh
node scripts/marketing.mjs mutate data/inbox/change.json
```

Use an unused ID for a new record. An upsert replaces the whole matching record, so copy and preserve all existing fields when editing. Related changes can be submitted in one `operations` array. Deletions use `{"op":"delete","collection":"clients","id":"client-cedar"}`; references must remain valid after the complete batch. The server rejects orphaned accounts, campaigns, goals, metrics, and other dependent records.

The `revision` is an optimistic concurrency token. If the browser or another task saves after you read the state, the server responds with `409`. Read the latest state, reconcile the requested edit, and prepare a new payload. Never blindly replace a newer workspace with an old snapshot.

The definitive fields and allowed values are in [CONTRACT.md](CONTRACT.md).

## Import a spreadsheet

Preview the source before deciding its mapping:

```sh
node scripts/marketing.mjs import-preview data/inbox/instagram-export.xlsx
node scripts/marketing.mjs import-preview data/inbox/instagram-export.xlsx --sheet "Weekly metrics"
```

Save a mapping file such as `data/inbox/mapping.json`:

```json
{
  "revision": "COPY_THE_CURRENT_REVISION",
  "sheet": "Weekly metrics",
  "accountId": "COPY_EXISTING_ACCOUNT_ID",
  "kpiId": "COPY_KPI_ID_FROM_THAT_ACCOUNT",
  "campaignId": "COPY_EXISTING_CAMPAIGN_ID",
  "mapping": {
    "date": "Reporting date",
    "value": "Reach"
  }
}
```

Then run:

```sh
node scripts/marketing.mjs import-commit data/inbox/instagram-export.xlsx data/inbox/mapping.json
```

Omit `sheet` for CSV. Omit `campaignId` for account observations that should not be restricted to a single campaign. Set `strategyId` or `postId` only when the source metrics specifically describe that strategy or post. Account-wide campaign progress intentionally excludes these content-specific observations.

Each import maps one KPI. For a table with reach, saves, and enquiries columns, import it once per KPI with a fresh revision each time. The entire input is validated before committing. Exact duplicate observations are skipped and reported. Dates should be ISO `YYYY-MM-DD` or valid Excel date cells; ambiguous date strings should be normalized after the user clarifies their meaning. Formula cells are not executed. Convert legacy `.xls` workbooks to `.xlsx` or CSV first.

Files can contain up to 8 MB and 20,000 data rows; the browser previews the first 100. Numbers use a decimal point, with optional comma thousands separators. CSV `4.5%` and an Excel percentage cell displayed as `4.5%` both import as `4.5` percentage points, matching manual entry. A plain, unformatted `0.045` stays `0.045`; normalize it if it represents a fraction. Check the preview and maintain consistent units and reporting periods. Currency strings and ambiguous decimal commas require explicit normalization before import.

When a chat attachment has no accessible local file path, Codex needs an accessible attachment before it can import its content. It must not pretend to have imported a file based on its name alone.

## Save an assessment or learning

Assessment records target a `campaign`, `strategy`, or `post`. Use actual observations in `summary`, and record `different`, `same`, `better`, `worse`, and `nextTest`. The matching campaign/strategy `nextReviewDate` advances according to its configurable interval.

A saved Codex best practice can look like this (replace IDs and evidence with the actual records):

```json
{
  "id": "practice-specific-new-id",
  "clientId": "client-id",
  "strategyId": "strategy-id",
  "title": "Test a visible result in the opening seconds",
  "evidence": "Two linked videos in the September test had higher saved observations than the campaign baseline; cite exact dates and values here.",
  "explanation": "An early demonstration may have made the benefit easier to understand. The observations do not isolate this from topic or distribution effects.",
  "nextTest": "Compare two otherwise similar videos, changing only the opening. Assess the same KPI after seven days.",
  "confidence": "hypothesis",
  "source": "codex"
}
```

This is a schema example, not a claim about this workspace's results. Submit it in an upsert operation only after substituting real evidence.

## Back up and recover

```sh
node scripts/marketing.mjs export my-workspace-backup.json
```

This creates a new file and refuses to overwrite an existing file. The application also keeps write backups under `data/backups/`.

To recover from a known JSON export, stop every server using this folder, make a separate copy of the current `data/workspace.json`, validate the chosen backup with the exported `validateState` function from `server/store.mjs`, and replace `data/workspace.json` with that validated file. Start the server and verify client names, dates, and metrics. Never restore files while a server is writing. Codex can perform these steps when you explicitly ask to restore a specified backup.

To replace this workspace with an empty state, stop its server and run:

```sh
node scripts/marketing.mjs reset empty --confirm-reset
```

Reset refuses to run while this folder's server responds on the configured port. If you used another port, stop that server too and keep `PORT` consistent. It creates a timestamped backup before replacing an existing file. The reset is never part of normal startup.

## Package a fresh instance

```sh
npm run package
npm run package -- /absolute/path/to/a-new-folder
```

The destination must not exist. The new folder contains source, documentation, a locked dependency list, and `PACKAGE-MANIFEST.json` with SHA-256 hashes of copied files. It contains no active workspace, demo seed, backups, attachment inbox contents, dependencies, or hidden configuration. It is a folder distribution, so recipients can install platform-appropriate dependencies with `npm ci`. Compress that new folder if you want a ZIP.

## Troubleshooting

| Problem | Action |
| --- | --- |
| Node is missing or too old | Install Node.js 22 or newer and reopen the terminal |
| Dependencies are missing | Run `npm ci` in this folder |
| Another folder/app occupies the port | Stop that instance or set a different `PORT`; do not kill an unknown process |
| CLI says the workspace is not running | Start `npm start` and verify the CLI uses the same `PORT` |
| A revision conflict occurs | Read state again and reconcile changes |
| An imported row is invalid | Correct its date/value or clarify the mapping; the failed import commits nothing |
| UI code changed | Run `npm start` to rebuild as needed, then reload the browser |
| Server code changed | Stop and restart the server |
| Codex does not follow the greeting instructions | Start a new local task rooted in this folder and ensure its `AGENTS.md` is loaded |
