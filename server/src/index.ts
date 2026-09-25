import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchTarget,
  rewriteCss,
  rewriteHtml,
  targetFromPath,
} from "./gateway.js";
import {
  authenticatedUser,
  defaultLimits,
  RelayQuota,
  type RelayLimits,
} from "./policy.js";

export interface RelayConfig {
  mode: "local" | "relay";
  host: string;
  port: number;
  basePath: string;
  proxySecret?: string;
  limits?: RelayLimits;
}

const demoRoot = resolve(
  fileURLToPath(new URL("../../apps/playground/dist/", import.meta.url)),
);
const runtimePath = fileURLToPath(
  new URL("./tinybrowser-runtime.js", import.meta.url),
);
const packagedFixturePath = fileURLToPath(
  new URL("./demo/index.html", import.meta.url),
);
const fixturePath = existsSync(packagedFixturePath)
  ? packagedFixturePath
  : fileURLToPath(
      new URL("../../apps/playground/public/demo/index.html", import.meta.url),
    );
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

export function configFromEnv(env = process.env): RelayConfig {
  const mode = env.TINYBROWSER_MODE === "relay" ? "relay" : "local";
  if (
    env.TINYBROWSER_MODE &&
    !["relay", "local"].includes(env.TINYBROWSER_MODE)
  )
    throw new Error("TINYBROWSER_MODE must be local or relay.");
  const basePath =
    env.TINYBROWSER_BASE_PATH ?? (mode === "relay" ? "/tinybrowser" : "");
  if (
    basePath &&
    (!/^\/[A-Za-z0-9._~/-]+$/.test(basePath) ||
      basePath.includes("//") ||
      basePath.endsWith("/") ||
      basePath
        .split("/")
        .some((segment) => segment === "." || segment === ".."))
  )
    throw new Error(
      "TINYBROWSER_BASE_PATH must be an absolute path without a trailing slash.",
    );
  const port = Number(
    env.TINYBROWSER_PORT ?? (mode === "relay" ? env.PORT : undefined) ?? 8080,
  );
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("TINYBROWSER_PORT must be a valid port.");
  const host =
    mode === "relay" ? (env.TINYBROWSER_HOST ?? "0.0.0.0") : "127.0.0.1";
  const proxySecret = env.TINYBROWSER_PROXY_SECRET;
  if (mode === "relay" && (!proxySecret || proxySecret.length < 32))
    throw new Error(
      "Relay mode requires TINYBROWSER_PROXY_SECRET of at least 32 characters.",
    );
  const limits = { ...defaultLimits };
  for (const [variable, key] of [
    ["TINYBROWSER_MAX_CONCURRENT", "maxConcurrent"],
    ["TINYBROWSER_MAX_CONCURRENT_PER_USER", "maxConcurrentPerUser"],
    ["TINYBROWSER_MAX_REQUESTS_PER_MINUTE", "maxRequestsPerMinute"],
    ["TINYBROWSER_MAX_BYTES_PER_MINUTE", "maxBytesPerMinute"],
  ] as const) {
    if (env[variable] === undefined) continue;
    const value = Number(env[variable]);
    if (!Number.isSafeInteger(value) || value < 1)
      throw new Error(`${variable} must be a positive integer.`);
    limits[key] = value;
  }
  return { mode, host, port, basePath, proxySecret, limits };
}

function send(
  response: ServerResponse,
  status: number,
  body: string,
  type = "text/plain; charset=utf-8",
) {
  response.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

export function createRelayServer(config: RelayConfig) {
  const quota = new RelayQuota(config.limits ?? defaultLimits);
  return createServer(
    async (request: IncomingMessage, response: ServerResponse) => {
      const path = request.url ?? "/";
      const pathname = path.split("?")[0];
      const health = `${config.basePath}/health`;
      const ready = `${config.basePath}/ready`;
      const browse = `${config.basePath}/browse/`;
      const runtime = `${config.basePath}/tinybrowser-runtime.js`;
      if (request.method !== "GET" && request.method !== "HEAD") {
        send(response, 405, "Method not allowed");
        return;
      }
      if (pathname === health || pathname === ready) {
        send(
          response,
          200,
          JSON.stringify({ ok: true, service: "tinybrowser-relay" }),
          "application/json",
        );
        return;
      }
      const isBrowse = path.startsWith(browse);
      const isRuntime = pathname === runtime;
      if (config.mode === "relay" && !isBrowse && !isRuntime) {
        send(response, 404, "Not found");
        return;
      }
      let user = "local";
      if (config.mode === "relay") {
        const identity = authenticatedUser(request, config.proxySecret!);
        if (!identity) {
          send(response, 401, "Authentication required");
          return;
        }
        user = identity;
      }
      const release = quota.acquire(user);
      if (!release) {
        send(response, 429, "Relay quota exceeded");
        return;
      }
      try {
        if (isRuntime) {
          const body = readFileSync(runtimePath);
          if (!quota.charge(user, body.length)) {
            send(response, 429, "Relay bandwidth quota exceeded");
            return;
          }
          response.writeHead(200, {
            "content-type": "text/javascript; charset=utf-8",
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
          });
          response.end(request.method === "HEAD" ? undefined : body);
          return;
        }
        if (isBrowse) {
          const target = targetFromPath(path, config.basePath);
          let body: Buffer;
          let status = 200;
          let contentType = "text/html; charset=utf-8";
          if (
            target.hostname === "demo.tinybrowser" &&
            target.pathname === "/"
          ) {
            body = Buffer.from(
              rewriteHtml(
                readFileSync(fixturePath, "utf8"),
                target,
                config.basePath,
              ),
            );
          } else {
            const upstream = await fetchTarget(target);
            status = upstream.status;
            contentType = String(
              upstream.headers["content-type"] ?? "application/octet-stream",
            );
            body = upstream.body;
            if (/text\/html|application\/xhtml\+xml/i.test(contentType))
              body = Buffer.from(
                rewriteHtml(
                  body.toString("utf8"),
                  upstream.finalUrl,
                  config.basePath,
                ),
              );
            else if (/text\/css/i.test(contentType))
              body = Buffer.from(
                rewriteCss(
                  body.toString("utf8"),
                  upstream.finalUrl,
                  config.basePath,
                ),
              );
          }
          if (body.length > 15_000_000)
            throw new Error("Rewritten response exceeds the 15 MB limit.");
          if (!quota.charge(user, body.length)) {
            send(response, 429, "Relay bandwidth quota exceeded");
            return;
          }
          response.writeHead(status, {
            "content-type": contentType,
            "cache-control": "no-store",
            "x-content-type-options": "nosniff",
            "content-security-policy": "frame-ancestors 'self'",
            "referrer-policy": "no-referrer",
          });
          response.end(request.method === "HEAD" ? undefined : body);
          return;
        }
        const filePath = resolve(
          demoRoot,
          `.${pathname === "/" ? "/index.html" : decodeURIComponent(pathname)}`,
        );
        if (
          !filePath.startsWith(demoRoot + sep) ||
          !existsSync(filePath) ||
          !statSync(filePath).isFile()
        ) {
          send(response, 404, "Not found");
          return;
        }
        const size = statSync(filePath).size;
        if (!quota.charge(user, size)) {
          send(response, 429, "Relay bandwidth quota exceeded");
          return;
        }
        response.writeHead(200, {
          "content-type":
            types[extname(filePath)] ?? "application/octet-stream",
          "cache-control": "no-store",
        });
        if (request.method === "HEAD") response.end();
        else createReadStream(filePath).pipe(response);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (isBrowse) {
          const safe = message.replace(
            /[&<>]/g,
            (character) =>
              ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!,
          );
          const encoded = JSON.stringify(message).replace(/</g, "\\u003c");
          send(
            response,
            502,
            `<!doctype html><title>Could not open page</title><body style="font:16px system-ui;padding:24px"><h1>Could not open page</h1><p>${safe}</p><script>parent.postMessage({type:"tinybrowser:load-error",message:${encoded}},"*")</script>`,
            "text/html; charset=utf-8",
          );
        } else send(response, 502, `Tiny Browser error: ${message}`);
      } finally {
        release();
      }
    },
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const config = configFromEnv();
  const server = createRelayServer(config);
  server.listen(config.port, config.host, () =>
    console.log(
      `Tiny Browser ${config.mode} listening on ${config.host}:${config.port}${config.basePath}`,
    ),
  );
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
