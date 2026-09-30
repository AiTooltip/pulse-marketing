import { realpath, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

export const root = await realpath(
  fileURLToPath(new URL("../", import.meta.url)),
);
export const port = Number(process.env.PORT || 4310);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be an integer from 1 to 65535.");
export const baseUrl = `http://127.0.0.1:${port}`;

export function requireNode() {
  if (Number(process.versions.node.split(".")[0]) < 22) {
    throw new Error(
      `Node.js 22 or newer is required. You are using ${process.version}.`,
    );
  }
}

export async function health() {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
  } catch (error) {
    if (error.cause?.code === "ECONNREFUSED") return null;
    throw new Error(
      `Could not verify the service at ${baseUrl}: ${error.message}`,
    );
  }
  if (!response.ok)
    throw new Error(
      `Port ${port} is occupied by a service that is not this workspace. Choose another PORT.`,
    );
  let body;
  try {
    body = await response.json();
  } catch {
    throw new Error(
      `Port ${port} is occupied by an unidentified service. Choose another PORT.`,
    );
  }
  if (body.app !== "marketing-control-center" || body.ok !== true) {
    throw new Error(
      `Port ${port} is occupied by a different application. Choose another PORT.`,
    );
  }
  let servedRoot;
  try {
    servedRoot = await realpath(body.workspaceRoot);
  } catch {
    servedRoot = body.workspaceRoot;
  }
  if (servedRoot !== root) {
    throw new Error(
      `Port ${port} belongs to another Marketing Control Center folder. Stop that instance or choose another PORT.`,
    );
  }
  return body;
}

export async function requireServer() {
  if (!(await health()))
    throw new Error(
      `This workspace is not running at ${baseUrl}. Run npm start in this folder first.`,
    );
}

export async function api(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined
        ? {}
        : { "Content-Type": "application/json", Origin: baseUrl },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
  const text = await response.text();
  let result;
  try {
    result = JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned an invalid JSON response (${response.status}).`,
    );
  }
  if (!response.ok) {
    const message = result.error || result.message || `HTTP ${response.status}`;
    const detail =
      typeof message === "string" ? message : JSON.stringify(message);
    throw new Error(
      response.status === 409
        ? `${detail} Read state again and reapply your intended changes; do not overwrite another edit.`
        : detail,
    );
  }
  return result;
}

export async function readJson(path) {
  if (!path) throw new Error("A JSON file path is required. See --help.");
  try {
    return JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    throw new Error(`Could not read JSON from ${path}: ${error.message}`);
  }
}
