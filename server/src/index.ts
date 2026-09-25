import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  fetchTarget,
  rewriteCss,
  rewriteHtml,
  targetFromPath,
} from "./gateway.js";

const port = Number(process.env.TINYBROWSER_PORT ?? 8080);
const host = "127.0.0.1";
const root = resolve(
  fileURLToPath(new URL("../../apps/playground/dist/", import.meta.url)),
);
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

const server = createServer(async (request, response) => {
  try {
    const path = request.url ?? "/";
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405);
      response.end();
      return;
    }
    if (path === "/health") {
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({ ok: true, service: "tinybrowser-gateway" }),
      );
      return;
    }
    if (path.startsWith("/browse/")) {
      const target = targetFromPath(path);
      if (target.hostname === "demo.tinybrowser" && target.pathname === "/") {
        const demo = readFileSync(resolve(root, "demo/index.html"), "utf8");
        response.writeHead(200, {
          "content-type": "text/html; charset=utf-8",
          "cache-control": "no-store",
        });
        response.end(
          request.method === "HEAD" ? undefined : rewriteHtml(demo, target),
        );
        return;
      }
      const upstream = await fetchTarget(target);
      const contentType = String(
        upstream.headers["content-type"] ?? "application/octet-stream",
      );
      let body = upstream.body;
      if (/text\/html|application\/xhtml\+xml/i.test(contentType))
        body = Buffer.from(
          rewriteHtml(body.toString("utf8"), upstream.finalUrl),
        );
      else if (/text\/css/i.test(contentType))
        body = Buffer.from(
          rewriteCss(body.toString("utf8"), upstream.finalUrl),
        );
      response.writeHead(upstream.status, {
        "content-type": contentType,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : body);
      return;
    }
    const pathname = decodeURIComponent(path.split("?")[0]);
    const filePath = resolve(
      root,
      `.${pathname === "/" ? "/index.html" : pathname}`,
    );
    if (
      !filePath.startsWith(root + sep) ||
      !existsSync(filePath) ||
      !statSync(filePath).isFile()
    ) {
      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": types[extname(filePath)] ?? "application/octet-stream",
      "cache-control": "no-store",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(filePath).pipe(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if ((request.url ?? "").startsWith("/browse/")) {
      const safe = message.replace(
        /[&<>]/g,
        (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character]!,
      );
      const encoded = JSON.stringify(message).replace(/</g, "\\u003c");
      response.writeHead(502, {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(
        `<!doctype html><title>Could not open page</title><body style="font:16px system-ui;padding:24px"><h1>Could not open page</h1><p>${safe}</p><script>parent.postMessage({type:"tinybrowser:load-error",message:${encoded}},"*")</script>`,
      );
    } else {
      response.writeHead(502, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
      });
      response.end(`TinyBrowser error: ${message}`);
    }
  }
});
server.listen(port, host, () =>
  console.log(`TinyBrowser gateway listening at http://${host}:${port}`),
);
