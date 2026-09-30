#!/usr/bin/env node
import { readFile, writeFile, mkdir, copyFile, rename } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  root,
  baseUrl,
  health,
  requireNode,
  requireServer,
  api,
  readJson,
} from "./runtime.mjs";
import {
  today,
  notifications,
  goalProgress,
  strategyPerformance,
} from "../shared/domain.mjs";

const help = `Marketing Control Center — local workspace tools

Run npm start first for read/write API commands.

  node scripts/marketing.mjs brief [--json]
  node scripts/marketing.mjs state
  node scripts/marketing.mjs mutate changes.json
  node scripts/marketing.mjs import-preview export.csv [--sheet "Sheet name"]
  node scripts/marketing.mjs import-commit export.xlsx mapping.json
  node scripts/marketing.mjs export [backup.json]
  node scripts/marketing.mjs reset empty --confirm-reset

mutate requires {revision,operations:[{op:"upsert",collection,value}]}.
Read state immediately before preparing changes. Re-read on a revision conflict.
import-commit mapping JSON requires revision, accountId, kpiId, and
mapping:{date:"Date column",value:"Value column"}; sheet and campaignId,
strategyId, postId are optional. Preview before committing.
Reset requires stopping this folder's server first and backs up its current data.
PORT selects a different local port (default: 4310). See docs/CODEX-WORKFLOW.md.
`;

function makeBrief(state) {
  const alerts = notifications(state);
  const campaigns = state.campaigns
    .filter((c) => c.status === "active")
    .map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      client:
        state.clients.find((c) => c.id === campaign.clientId)?.name ||
        campaign.clientId,
      endDate: campaign.endDate,
      nextReviewDate: campaign.nextReviewDate,
      goals: campaign.goals.map((goal) => {
        const account = state.accounts.find((a) => a.id === goal.accountId);
        const kpi = account?.kpis.find((k) => k.id === goal.kpiId);
        const progress = goalProgress(state, campaign, goal);
        return {
          id: goal.id,
          account: account?.handle || account?.name,
          kpi: kpi?.name,
          unit: kpi?.unit,
          baseline: goal.baseline,
          target: goal.target,
          current: progress.current,
          progress: progress.percent,
          expectedProgress: progress.expectedPercent,
          hasData: progress.hasData,
          onTrack: progress.onTrack,
        };
      }),
    }));
  const strategies = state.strategies
    .map((strategy) => ({
      id: strategy.id,
      name: strategy.name,
      campaignId: strategy.campaignId,
      hypothesis: strategy.hypothesis,
      ...strategyPerformance(state, strategy),
    }))
    .filter((s) => s.score !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  return {
    date: today(),
    workspace: state.settings.workspaceName,
    revision: state.revision,
    counts: {
      clients: state.clients.length,
      accounts: state.accounts.length,
      activeCampaigns: campaigns.length,
      plannedPosts: state.posts.filter((p) => p.status === "planned").length,
    },
    notifications: alerts,
    campaigns,
    topStrategies: strategies,
    interpretation:
      "Strategy scores describe associated observations against campaign targets; they do not establish causality.",
  };
}

function printBrief(brief) {
  console.log(`${brief.workspace} • ${brief.date}`);
  console.log(
    `${brief.counts.clients} clients · ${brief.counts.accounts} social accounts · ${brief.counts.activeCampaigns} active campaigns · ${brief.counts.plannedPosts} planned posts`,
  );
  console.log("\nAttention and upcoming work");
  if (!brief.notifications.length)
    console.log("No reminders due or upcoming in the next seven days.");
  for (const item of brief.notifications)
    console.log(
      `- [${item.severity}] ${item.title}${item.date ? ` (${item.date})` : ""}${item.detail ? ` — ${item.detail}` : ""}`,
    );
  if (brief.campaigns.length) console.log("\nActive campaigns");
  for (const campaign of brief.campaigns) {
    console.log(
      `- ${campaign.name} · ${campaign.client} · ends ${campaign.endDate}`,
    );
    for (const goal of campaign.goals) {
      const progress = Number.isFinite(goal.progress)
        ? `${Math.round(goal.progress)}% of baseline-to-target change`
        : "progress unavailable";
      console.log(
        `  ${goal.account} / ${goal.kpi}: ${goal.current} → ${goal.target} ${goal.unit || ""}; ${goal.hasData ? progress : "no observations yet"}`,
      );
    }
  }
  if (brief.topStrategies.length) {
    console.log("\nHighest observed strategy progress");
    for (const strategy of brief.topStrategies)
      console.log(
        `- ${strategy.name}: ${Math.round(strategy.score)}%, ${strategy.samples} observation(s)`,
      );
    console.log(brief.interpretation);
  }
  console.log(`\nOpen ${baseUrl}`);
}

async function importBody(file) {
  if (!file) throw new Error("Provide a CSV or XLSX file path.");
  return {
    filename: basename(file),
    content: (await readFile(resolve(file))).toString("base64"),
  };
}

async function reset(mode, flags) {
  if (mode !== "empty" || !flags.includes("--confirm-reset")) {
    throw new Error(
      "Reset replaces this workspace. Use reset empty --confirm-reset only when you intend to replace its data.",
    );
  }
  if (await health())
    throw new Error(
      "Stop the server for this folder before resetting (Ctrl+C in its terminal).",
    );
  const { emptyState, validateState } = await import("../server/store.mjs");
  const state = emptyState();
  state.revision = randomUUID();
  validateState(state);
  const dataDir = join(root, "data");
  const currentFile = join(dataDir, "workspace.json");
  const backupDir = join(dataDir, "backups");
  await mkdir(backupDir, { recursive: true });
  const backup = join(
    backupDir,
    `before-reset-${new Date().toISOString().replaceAll(":", "-")}-${randomUUID().slice(0, 8)}.json`,
  );
  try {
    await copyFile(currentFile, backup);
    console.log(`Previous workspace backed up to ${backup}`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const temporary = join(dataDir, `.reset-${randomUUID()}.tmp`);
  await writeFile(temporary, `${JSON.stringify(state, null, 2)}\n`, {
    flag: "wx",
    mode: 0o600,
  });
  await rename(temporary, currentFile);
  console.log(`Workspace reset to ${mode}. Run npm start to open it.`);
}

try {
  requireNode();
  const [command = "help", ...args] = process.argv.slice(2);
  if (["help", "--help", "-h"].includes(command)) console.log(help);
  else if (command === "reset") await reset(args[0], args.slice(1));
  else {
    if (
      ![
        "brief",
        "state",
        "mutate",
        "import-preview",
        "import-commit",
        "export",
      ].includes(command)
    )
      throw new Error(`Unknown command: ${command}. Use --help.`);
    await requireServer();
    if (command === "brief") {
      const brief = makeBrief(await api("/api/state"));
      if (args.includes("--json")) console.log(JSON.stringify(brief, null, 2));
      else printBrief(brief);
    } else if (command === "state")
      console.log(JSON.stringify(await api("/api/state"), null, 2));
    else if (command === "mutate") {
      const body = await readJson(args[0]);
      if (typeof body.revision !== "string" || !Array.isArray(body.operations))
        throw new Error(
          "Changes JSON must contain revision and operations. Read current state first.",
        );
      const state = await api("/api/mutate", body);
      console.log(
        JSON.stringify(
          {
            saved: true,
            revision: state.revision,
            operations: body.operations.length,
          },
          null,
          2,
        ),
      );
    } else if (command === "import-preview") {
      const body = await importBody(args[0]);
      const sheetIndex = args.indexOf("--sheet");
      if (sheetIndex !== -1) {
        if (!args[sheetIndex + 1])
          throw new Error("--sheet requires a sheet name.");
        body.sheet = args[sheetIndex + 1];
      }
      console.log(
        JSON.stringify(await api("/api/import/preview", body), null, 2),
      );
    } else if (command === "import-commit") {
      const mapping = await readJson(args[1]);
      if (typeof mapping.revision !== "string")
        throw new Error(
          "Mapping JSON must include the revision from a fresh state read.",
        );
      const result = await api("/api/import/commit", {
        ...mapping,
        ...(await importBody(args[0])),
      });
      console.log(
        JSON.stringify(
          {
            imported: result.imported,
            skipped: result.skipped,
            revision: result.state.revision,
          },
          null,
          2,
        ),
      );
    } else if (command === "export") {
      const state = await api("/api/export");
      if (args[0]) {
        const output = resolve(args[0]);
        await writeFile(output, `${JSON.stringify(state, null, 2)}\n`, {
          flag: "wx",
          mode: 0o600,
        });
        console.log(`Exported workspace to ${output}`);
      } else console.log(JSON.stringify(state, null, 2));
    }
  }
} catch (error) {
  console.error(`Marketing command failed: ${error.message}`);
  process.exitCode = 1;
}
