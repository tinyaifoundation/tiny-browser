import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { timingSafeEqual } from "node:crypto";

const root = resolve(
  fileURLToPath(new URL("../../apps/playground/dist/", import.meta.url)),
);
const relay = process.env.RELAY_URL ?? "http://127.0.0.1:8080";
const secret = process.env.TINYBROWSER_PROXY_SECRET;
const username = process.env.APP_USER;
const password = process.env.APP_PASSWORD;
const port = Number(process.env.APP_PORT ?? 3000);
if (!secret || !username || !password)
  throw new Error("Set TINYBROWSER_PROXY_SECRET, APP_USER, and APP_PASSWORD.");
if (!/^https?:\/\//.test(relay))
  throw new Error("RELAY_URL must be an HTTP(S) URL.");

function equal(left, right) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

export function createAppServer() {
  return createServer(async (request, response) => {
    const authorization = request.headers.authorization ?? "";
    const pair = authorization.startsWith("Basic ")
      ? Buffer.from(authorization.slice(6), "base64").toString("utf8")
      : "";
    if (!equal(pair, `${username}:${password}`)) {
      response.writeHead(401, {
        "www-authenticate": 'Basic realm="Tiny Browser example"',
        "cache-control": "no-store",
      });
      response.end("Authentication required");
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end();
      return;
    }
    const path = request.url ?? "/";
    if (path.startsWith("/tinybrowser/")) {
      try {
        const upstream = await fetch(new URL(path, relay), {
          method: request.method,
          redirect: "manual",
          headers: {
            "x-tinybrowser-proxy-secret": secret,
            "x-tinybrowser-user": username,
          },
        });
        const body = Buffer.from(await upstream.arrayBuffer());
        response.writeHead(upstream.status, {
          "content-type":
            upstream.headers.get("content-type") ?? "application/octet-stream",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "content-security-policy": "frame-ancestors 'self'",
        });
        response.end(request.method === "HEAD" ? undefined : body);
      } catch (error) {
        response.writeHead(502);
        response.end(String(error));
      }
      return;
    }
    const pathname = path.split("?")[0];
    let file;
    try {
      file = resolve(
        root,
        `.${pathname === "/" ? "/index.html" : decodeURIComponent(pathname)}`,
      );
    } catch {
      response.writeHead(400);
      response.end();
      return;
    }
    if (
      !file.startsWith(root + sep) ||
      !existsSync(file) ||
      !statSync(file).isFile()
    ) {
      response.writeHead(404);
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": contentTypes[extname(file)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else if (pathname === "/") {
      const html = readFileSync(file, "utf8").replace(
        "</head>",
        '<script>window.__tinybrowserRelayBasePath="/tinybrowser"</script></head>',
      );
      response.end(html);
    } else createReadStream(file).pipe(response);
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  createAppServer().listen(port, "127.0.0.1", () =>
    console.log(`Hosted app example listening at http://127.0.0.1:${port}`),
  );
}
