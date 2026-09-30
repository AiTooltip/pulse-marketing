#!/usr/bin/env node
import {
  mkdir,
  readdir,
  copyFile,
  lstat,
  readFile,
  writeFile,
  chmod,
} from "node:fs/promises";
import { resolve, join, dirname } from "node:path";
import { createHash } from "node:crypto";
import { root, requireNode } from "./runtime.mjs";

// Deliberate allowlist: never copy the live data directory, secrets, or attachments.
const included = [
  "package.json",
  "package-lock.json",
  "README.md",
  "AGENTS.md",
  "CLAUDE.md",
  "Open Pulse.command",
  "index.html",
  "vite.config.js",
  "src",
  "public",
  "server",
  "shared",
  "scripts",
  "docs",
  "tests",
];
const skipped = new Set([
  ".DS_Store",
  ".env",
  ".env.local",
  "node_modules",
  ".git",
  ".codex",
  ".agents",
  "dist",
  "releases",
  "backups",
  "inbox",
  "workspace.json",
]);
const hashes = {};

try {
  requireNode();
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log(
      "Usage: npm run package -- [new-output-folder]\nCreates a fresh, empty folder with source and locked dependencies. Never includes live workspace data or attachments.",
    );
    process.exit(0);
  }
  if (args.length > 1) throw new Error("Provide at most one output folder.");
  const stamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d+Z$/, "Z");
  const destination = args[0]
    ? resolve(args[0])
    : join(root, "releases", `marketing-control-center-${stamp}`);
  // Refuse an existing folder so packaging cannot overwrite user files.
  await mkdir(dirname(destination), { recursive: true });
  await mkdir(destination, { recursive: false });
  async function copy(path) {
    const absolute = join(root, path);
    const info = await lstat(absolute);
    if (info.isSymbolicLink())
      throw new Error(`Refusing symlink in distribution: ${path}`);
    if (info.isDirectory()) {
      await mkdir(join(destination, path), { recursive: true });
      for (const entry of (await readdir(absolute)).sort()) {
        if (entry.startsWith(".") || skipped.has(entry)) continue;
        await copy(join(path, entry));
      }
    } else if (info.isFile()) {
      await mkdir(dirname(join(destination, path)), { recursive: true });
      await copyFile(absolute, join(destination, path));
      await chmod(join(destination, path), info.mode & 0o777);
      hashes[path.replaceAll("\\", "/")] = createHash("sha256")
        .update(await readFile(absolute))
        .digest("hex");
    }
  }
  for (const path of included) await copy(path);
  await mkdir(join(destination, "data/inbox"), { recursive: true });
  await writeFile(
    join(destination, "PACKAGE-MANIFEST.json"),
    `${JSON.stringify({ app: "marketing-control-center", createdAt: new Date().toISOString(), includesLiveData: false, firstRun: "Mac: double-click Open Pulse.command; otherwise npm ci then npm start", files: hashes }, null, 2)}\n`,
  );
  console.log(`Shareable folder created: ${destination}`);
  console.log(
    `Included ${Object.keys(hashes).length} files. Live data, backups, attachments, credentials, and installed dependencies were excluded.`,
  );
  console.log(
    'Recipients: double-click Open Pulse.command on Mac, open the folder as a local Codex project and say "hi", or run npm ci then npm start.',
  );
} catch (error) {
  console.error(`Packaging failed: ${error.message}`);
  process.exitCode = 1;
}
