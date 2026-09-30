#!/usr/bin/env node
import { access, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join, relative } from "node:path";
import { spawn } from "node:child_process";
import { root, baseUrl, health, requireNode } from "./runtime.mjs";

async function sourceHash() {
  const hash = createHash("sha256");
  async function visit(path) {
    let entries;
    try {
      entries = await readdir(path, { withFileTypes: true });
    } catch (error) {
      if (error.code !== "ENOTDIR") {
        if (error.code === "ENOENT") return;
        throw error;
      }
      hash.update(relative(root, path));
      hash.update(await readFile(path));
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isSymbolicLink()) continue;
      await visit(join(path, entry.name));
    }
  }
  for (const name of [
    "src",
    "public",
    "shared",
    "index.html",
    "vite.config.js",
    "package.json",
    "package-lock.json",
  ])
    await visit(join(root, name));
  return hash.digest("hex");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: "inherit",
      shell: process.platform === "win32" && command.endsWith(".cmd"),
    });
    const signals = ["SIGINT", "SIGTERM"];
    const handlers = signals.map((signal) => () => child.kill(signal));
    signals.forEach((signal, i) => process.once(signal, handlers[i]));
    const cleanup = () =>
      signals.forEach((signal, i) =>
        process.removeListener(signal, handlers[i]),
      );
    child.once("error", (error) => {
      cleanup();
      reject(error);
    });
    child.once("exit", (code, signal) => {
      cleanup();
      if (signal)
        reject(
          Object.assign(new Error("Stopped."), {
            exitCode: signal === "SIGINT" ? 130 : 143,
          }),
        );
      else if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal || code}.`));
    });
  });
}

try {
  requireNode();
  const running = await health();
  try {
    await access(join(root, "node_modules/vite/package.json"));
  } catch {
    throw new Error(
      "Dependencies are missing. Run npm ci in this folder, then npm start.",
    );
  }
  const hash = await sourceHash();
  let previousHash = "";
  try {
    await access(join(root, "dist/index.html"));
    previousHash = await readFile(join(root, "dist/.source-hash"), "utf8");
  } catch {
    /* First run, or build directory was removed. */
  }
  if (hash !== previousHash) {
    console.log("Building Marketing Control Center…");
    await run(process.platform === "win32" ? "npm.cmd" : "npm", [
      "run",
      "build",
    ]);
    await writeFile(join(root, "dist/.source-hash"), hash);
  }
  if (running) {
    console.log(
      `Marketing Control Center is already running for this folder: ${baseUrl}`,
    );
  } else {
    console.log(`Starting Marketing Control Center at ${baseUrl}`);
    console.log("Keep this process running. Press Ctrl+C to stop.");
    await run(process.execPath, ["server/index.mjs"]);
  }
} catch (error) {
  if (!error.exitCode) console.error(`Startup failed: ${error.message}`);
  process.exitCode = error.exitCode || 1;
}
