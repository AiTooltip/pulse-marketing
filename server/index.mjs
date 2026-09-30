import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStore, AppError } from "./store.mjs";
import { parseImport, previewResult, mappedMetrics } from "./import.mjs";
import { notifications, today } from "../shared/domain.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".json": "application/json",
};
const MAX_BODY_BYTES = 12 * 1024 * 1024;

function json(response, status, data, headers = {}) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...headers,
  });
  response.end(JSON.stringify(data));
}

async function body(request) {
  if (
    !/^application\/json(?:\s*;|$)/i.test(request.headers["content-type"] || "")
  )
    throw new AppError(415, "Use application/json.");
  if (Number(request.headers["content-length"]) > MAX_BODY_BYTES)
    throw new AppError(413, "Request is too large. Maximum upload is 8 MB.");
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES)
      throw new AppError(413, "Request is too large. Maximum upload is 8 MB.");
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value;
  } catch {
    throw new AppError(400, "Request must contain a JSON object.");
  }
}

function trustedRequest(request, port) {
  const host = request.headers.host?.toLowerCase();
  const hosts = new Set([
    `127.0.0.1:${port}`,
    `localhost:${port}`,
    `[::1]:${port}`,
  ]);
  if (!hosts.has(host))
    throw new AppError(
      403,
      "Only requests addressed to this local instance are accepted.",
    );
  const origin = request.headers.origin;
  if (origin && ![...hosts].some((h) => origin === `http://${h}`))
    throw new AppError(403, "Cross-origin requests are not allowed.");
  if (request.headers["sec-fetch-site"] === "cross-site")
    throw new AppError(403, "Cross-site requests are not allowed.");
}

export async function startServer(options = {}) {
  const {
    dataFile = path.join(projectRoot, "data", "workspace.json"),
    distDir = path.join(projectRoot, "dist"),
    host = "127.0.0.1",
  } = options;
  const port = options.port ?? Number(process.env.PORT || 4310);
  if (!["127.0.0.1", "::1", "localhost"].includes(host))
    throw new Error("The marketing platform only binds to loopback.");
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("PORT must be an integer from 0 through 65535.");
  const store = createStore(dataFile);
  const staticRoot = path.resolve(distDir);
  const server = http.createServer(async (request, response) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader("X-Frame-Options", "DENY");
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
    );
    try {
      trustedRequest(request, server.address().port);
      let pathname;
      try {
        pathname = decodeURIComponent(
          new URL(request.url, `http://127.0.0.1:${server.address().port}`)
            .pathname,
        );
      } catch {
        throw new AppError(400, "Invalid URL.");
      }
      if (pathname.startsWith("/api/")) {
        if (request.method === "GET" && pathname === "/api/health")
          return json(response, 200, {
            ok: true,
            app: "marketing-control-center",
            workspaceRoot: path.dirname(path.dirname(path.resolve(dataFile))),
            schemaVersion: 1,
          });
        if (
          request.method === "GET" &&
          ["/api/state", "/api/export", "/api/brief"].includes(pathname)
        ) {
          const state = await store.read();
          if (pathname === "/api/brief")
            return json(response, 200, {
              date: today(),
              revision: state.revision,
              summary: {
                clients: state.clients.length,
                accounts: state.accounts.length,
                activeCampaigns: state.campaigns.filter(
                  (c) => c.status === "active",
                ).length,
                plannedPosts: state.posts.filter((p) => p.status === "planned")
                  .length,
              },
              notifications: notifications(state),
            });
          return json(
            response,
            200,
            state,
            pathname === "/api/export"
              ? {
                  "Content-Disposition": `attachment; filename="marketing-workspace-${today()}.json"`,
                }
              : {},
          );
        }
        if (request.method === "POST" && pathname === "/api/mutate") {
          const input = await body(request);
          const result = await store.mutate(input.revision, input.operations);
          return json(response, 200, result.state);
        }
        if (
          request.method === "POST" &&
          ["/api/import/preview", "/api/import/commit"].includes(pathname)
        ) {
          const input = await body(request);
          const parsed = await parseImport(input);
          if (pathname.endsWith("/preview"))
            return json(response, 200, previewResult(parsed));
          const rows = mappedMetrics(parsed, input);
          return json(
            response,
            200,
            await store.importMetrics(
              input.revision,
              rows,
              path.basename(input.filename),
            ),
          );
        }
        throw new AppError(404, "API endpoint not found.");
      }
      if (!["GET", "HEAD"].includes(request.method))
        throw new AppError(405, "Method not allowed.");
      if (
        pathname.includes("\0") ||
        pathname.includes("\\") ||
        pathname.split("/").some((segment) => segment.startsWith("."))
      )
        throw new AppError(404, "File not found.");
      let file = path.resolve(staticRoot, `.${pathname}`);
      if (file !== staticRoot && !file.startsWith(staticRoot + path.sep))
        throw new AppError(404, "File not found.");
      let stat;
      try {
        stat = await fs.stat(file);
      } catch {
        /* SPA route is served below. */
      }
      if (!stat?.isFile()) {
        if (path.extname(pathname) && pathname !== "/")
          throw new AppError(404, "File not found.");
        file = path.join(staticRoot, "index.html");
      }
      // Refuse symlinks escaping the build folder; data and source files are never served.
      try {
        const real = await fs.realpath(file);
        if (!real.startsWith((await fs.realpath(staticRoot)) + path.sep))
          throw new AppError(404, "File not found.");
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError(
          503,
          "The browser app is not built yet. Run npm run build, then reload.",
        );
      }
      const content = await fs.readFile(file);
      response.writeHead(200, {
        "Content-Type": mime[path.extname(file)] || "application/octet-stream",
        "Content-Length": content.length,
        "Cache-Control": pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch (error) {
      if (response.headersSent) {
        response.end();
        return;
      }
      const status = error instanceof AppError ? error.status : 500;
      if (status === 500)
        console.error("[marketing] Request failed:", error.name, error.message);
      json(response, status, {
        error:
          status === 500
            ? "The local operation failed. Check the server terminal for details; your workspace has been preserved."
            : error.message,
      });
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  const address = server.address();
  return {
    server,
    store,
    url: `http://${host === "::1" ? "[::1]" : host}:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeIdleConnections();
      }),
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  startServer()
    .then(({ server, url }) => {
      console.log(`Marketing Control Center is ready at ${url}`);
      for (const signal of ["SIGINT", "SIGTERM"])
        process.once(signal, () => server.close(() => process.exit(0)));
    })
    .catch((error) => {
      console.error(
        `Could not start Marketing Control Center: ${error.message}`,
      );
      process.exitCode = 1;
    });
}
