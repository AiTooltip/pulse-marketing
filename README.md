# Pulse — local marketing control center

Manage one brand or several clients, their social accounts, campaigns, content plans, experiments, and assessments. Everything you save in the browser is written to this folder. Codex can work with the same data through chat.

## Open your workspace

You need Node.js 22 or newer. Open this folder as a **local project** in Codex, start a task in the folder, and say **“hi”**. The included `AGENTS.md` tells Codex to start the platform, open it in a Codex browser panel when that tool is available, and report campaign reviews, content deadlines, and other due reminders.

Or open a terminal in this folder:

```sh
npm ci
npm start
```

On a Mac, double-click **Open Pulse.command** in this folder. It starts Pulse and opens it in your default browser when ready. Keep the Terminal window open while using the app; Ctrl+C stops the server. Node.js 22 or newer is required. The first start installs dependencies, builds the interface, and opens an empty workspace. Future starts preserve your work.

You can also open [Pulse in your browser](http://127.0.0.1:4310) after running `npm start`. Windows users can run `scripts/start-windows.cmd`.

The project uses Codex's documented project-instruction mechanism. See the [official AGENTS.md documentation](https://learn.chatgpt.com/docs/agent-configuration/agents-md). The greeting flow runs when you send a message; this folder alone cannot wake Codex or launch itself in the background.

## What you can manage

- **Clients and accounts:** Keep brands separate and choose the KPIs tracked for each social account.
- **Campaigns:** Set dates, objectives, account-specific KPI baselines and targets, review intervals, and reminders. Charts show observations and progress toward your goals.
- **Strategies:** Record the hypothesis, what you changed, what you kept, and a review schedule. Weekly reviews are the default; campaign reviews default to 30 days. Both are adjustable.
- **Content calendar:** Plan a Reel, video, post, carousel, story, or article with an outline, account, strategy, readiness, and date. Mark it executed or cancelled. Executed content becomes due for assessment after its configured delay, normally seven days.
- **Assessments:** Capture what was different, the same, better, worse, and what to test next. A campaign or strategy assessment moves its next review forward by the chosen interval.
- **Metrics:** Add observations manually, map CSV or Excel `.xlsx` tables, or ask Codex to import an attachment. Imports preview the file before committing.
- **Best practices:** Save the evidence behind a promising approach and the next experiment. Ask Codex to examine results, explain plausible reasons, and turn a learning into a strategy.

Metric values are **observations or snapshots**, not daily values that are automatically added together. For example, entering a reach value for two dates makes two chart points. Use a consistent reporting window when comparing those points. Account-level goals use matching account observations; observations attributed to an individual strategy or post are kept separate. Strategy comparisons describe associations against campaign targets, not proof that a creative choice caused a result.

## Work through Codex chat

Try:

- “Hi — what needs my attention this week?”
- “Add a client called Cedar Studio and an Instagram account tracking reach, saves, and enquiries.”
- “Create a six-week campaign to raise Instagram reach from 12,000 to 20,000, with a review every two weeks.”
- “Import this spreadsheet as weekly reach for Cedar Studio. Use Reporting date and Reach.”
- “Mark the product walkthrough as executed today and remind me to assess it in seven days.”
- “Compare the best-performing strategies, save the evidence as a best practice, and create a follow-up test.”

Codex reads the current data, applies your request through the same validated API as the browser, and checks the saved result. It asks when an account, date format, or column mapping is genuinely ambiguous. Its analysis is performed in chat; the local application has no embedded AI account, API key, or hidden background agent. Browser and chat changes share the same JSON store. Refresh the browser if a saved chat change has not appeared yet.

Reminders appear in the platform and in a fresh Codex greeting or briefing. They do not send email, push notifications, or social posts, and they do not wake a closed application. Scheduled notifications would require a separately requested automation.

## Your files

| Location | Purpose |
| --- | --- |
| `data/workspace.json` | Your live workspace: clients, accounts, campaigns, metrics, plans, assessments, and practices |
| `data/backups/` | Automatic write backups and backups made before explicit resets |
| `data/inbox/` | Optional place to keep files supplied for import |
| `docs/CONTRACT.md` | Exact data schema and API |
| `docs/CODEX-WORKFLOW.md` | Chat, command-line, import, and recovery examples |

Use the application's export action or `node scripts/marketing.mjs export my-backup.json` to make a separate JSON backup. The command refuses to overwrite an existing file. Keep a copy outside this folder if you need protection from deleting the folder or losing the computer.

The server listens only on `127.0.0.1`. This is a local, single-workspace tool without a login system, network hosting, or multi-user access controls. Social network connections and publishing are not included in this version. Data stays in this folder unless you copy, export, or share it, or provide it to Codex in a chat.

## Give someone their own instance

Run:

```sh
npm run package
```

Share the new folder printed under `releases/` (zip it if convenient). The package uses an explicit source-file allowlist and contains instructions, the dependency lockfile, and the Mac launcher. It **excludes your live workspace, backups, attachments, installed dependencies, and hidden configuration**. Recipients install Node.js and double-click `Open Pulse.command` on Mac, open the received folder as their own local Codex project and say “hi”, or run `npm ci` and `npm start`. Each recipient gets a separate empty workspace.

To give someone your actual campaigns and history instead, use an explicit workspace export and follow the recovery steps in the workflow guide. Treat that as sharing your client data.

## Reset to an empty workspace

Stop the server before this command. It makes a backup of the existing workspace and requires an explicit reset flag:

```sh
node scripts/marketing.mjs reset empty --confirm-reset
```

Then run `npm start`. An ordinary startup never resets your workspace.

## Developer commands

```sh
npm test
npm run build
npm run brief
node scripts/marketing.mjs --help
```

`npm start` rebuilds the frontend only when its source changes. It reuses a running server only after checking that the server belongs to this exact folder. After modifying server code, stop and restart the server. To run two workspace folders at once, assign the second a different `PORT` for both its server and CLI commands. See the workflow guide for platform-specific examples.
