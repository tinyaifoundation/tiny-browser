import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { BlockList, isIP } from "node:net";
import type { IncomingHttpHeaders } from "node:http";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const)
  blocked.addSubnet(address, prefix, "ipv6");

export function targetFromPath(path: string, basePath = ""): URL {
  const browse = `${basePath}/browse/`;
  if (!path.startsWith(browse)) throw new Error("Invalid relay path.");
  const match = /^(https?)\/([^/?#]+)(\/[^?#]*)?(\?[^#]*)?$/.exec(
    path.slice(browse.length),
  );
  if (!match) throw new Error("Expected /browse/https/example.com/path");
  const target = new URL(
    `${match[1]}://${match[2]}${match[3] || "/"}${match[4] || ""}`,
  );
  if (target.username || target.password)
    throw new Error("Credentials in URLs are blocked.");
  return target;
}
export function proxyPath(target: URL, basePath = ""): string {
  return `${basePath}/browse/${target.protocol.slice(0, -1)}/${target.host}${target.pathname}${target.search}${target.hash}`;
}

export async function safeAddress(
  target: URL,
): Promise<{ address: string; family: 4 | 6 }> {
  if (
    !["http:", "https:"].includes(target.protocol) ||
    target.username ||
    target.password ||
    target.port
  )
    throw new Error(
      "Only public HTTP and HTTPS URLs on standard ports are allowed.",
    );
  const hostname = target.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  )
    throw new Error("Local addresses are blocked.");
  const records = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    !records.length ||
    records.some(({ address, family }) =>
      blocked.check(address, family === 4 ? "ipv4" : "ipv6"),
    )
  )
    throw new Error("Private or reserved addresses are blocked.");
  return records[0] as { address: string; family: 4 | 6 };
}

export interface UpstreamResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
  finalUrl: URL;
}
type PinnedResponse = Omit<UpstreamResponse, "finalUrl">;
export interface FetchDependencies {
  resolveAddress?: typeof safeAddress;
  requestPinned?: (
    target: URL,
    address: { address: string; family: 4 | 6 },
  ) => Promise<PinnedResponse>;
}

export async function fetchTarget(
  target: URL,
  redirects = 0,
  dependencies: FetchDependencies = {},
): Promise<UpstreamResponse> {
  if (redirects > 5) throw new Error("Too many redirects.");
  const resolved = await (dependencies.resolveAddress ?? safeAddress)(target);
  const result = await (dependencies.requestPinned ?? requestPinned)(
    target,
    resolved,
  );
  if (result.body.length > 15_000_000)
    throw new Error("Response exceeds the 15 MB limit.");
  if (
    [301, 302, 303, 307, 308].includes(result.status) &&
    result.headers.location
  )
    return fetchTarget(
      new URL(result.headers.location, target),
      redirects + 1,
      dependencies,
    );
  return { ...result, finalUrl: target };
}

async function requestPinned(
  target: URL,
  resolved: { address: string; family: 4 | 6 },
): Promise<PinnedResponse> {
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  const result = await new Promise<{
    status: number;
    headers: IncomingHttpHeaders;
    body: Buffer;
  }>((resolve, reject) => {
    const upstream = request(
      target,
      {
        method: "GET",
        timeout: 12_000,
        headers: {
          "user-agent": "TinyBrowser/0.2",
          accept: "*/*",
          "accept-encoding": "identity",
        },
        lookup: (_hostname, options, callback) => {
          if (options.all) callback(null, [resolved]);
          else callback(null, resolved.address, resolved.family);
        },
      },
      (response) => {
        if (
          response.headers["content-encoding"] &&
          response.headers["content-encoding"] !== "identity"
        ) {
          upstream.destroy(
            new Error("Compressed upstream responses are unsupported."),
          );
          return;
        }
        if (Number(response.headers["content-length"] ?? 0) > 15_000_000) {
          upstream.destroy(new Error("Response exceeds the 15 MB limit."));
          return;
        }
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 15_000_000)
            upstream.destroy(new Error("Response exceeds the 15 MB limit."));
          else chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({
            status: response.statusCode ?? 502,
            headers: response.headers,
            body: Buffer.concat(chunks),
          }),
        );
        response.on("error", reject);
      },
    );
    const deadline = setTimeout(
      () => upstream.destroy(new Error("Upstream request timed out.")),
      15_000,
    );
    upstream.on("close", () => clearTimeout(deadline));
    upstream.on("timeout", () =>
      upstream.destroy(new Error("Upstream request timed out.")),
    );
    upstream.on("error", reject);
    upstream.end();
  });
  return result;
}

function rewriteUrl(value: string, base: URL, basePath = ""): string {
  if (!value || /^(#|data:|blob:|javascript:|mailto:|tel:)/i.test(value))
    return value;
  try {
    const target = new URL(value.replace(/&amp;/g, "&"), base);
    return ["http:", "https:"].includes(target.protocol)
      ? proxyPath(target, basePath)
      : value;
  } catch {
    return value;
  }
}
function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}
export function rewriteCss(css: string, base: URL, basePath = ""): string {
  return css
    .replace(
      /url\(\s*(['"]?)(.*?)\1\s*\)/gi,
      (_full, quote: string, value: string) =>
        `url(${quote}${rewriteUrl(value, base, basePath)}${quote})`,
    )
    .replace(
      /@import\s+(['"])(.*?)\1/gi,
      (_full, quote: string, value: string) =>
        `@import ${quote}${rewriteUrl(value, base, basePath)}${quote}`,
    );
}
export function rewriteHtml(html: string, base: URL, basePath = ""): string {
  let result = html.replace(
    /<meta\b[^>]*http-equiv\s*=\s*['"]?content-security-policy['"]?[^>]*>/gi,
    "",
  );
  result = result.replace(
    /\b(src|href|action|poster|formaction)\s*=\s*(["'])(.*?)\2/gi,
    (_full, name: string, quote: string, value: string) =>
      `${name}=${quote}${escapeAttribute(rewriteUrl(value, base, basePath))}${quote}`,
  );
  result = result.replace(
    /\bsrcset\s*=\s*(["'])(.*?)\1/gi,
    (_full, quote: string, value: string) =>
      `srcset=${quote}${value
        .split(",")
        .map((part) => {
          const match = /^(\s*)(\S+)(.*)$/.exec(part);
          return match
            ? `${match[1]}${escapeAttribute(rewriteUrl(match[2], base, basePath))}${match[3]}`
            : part;
        })
        .join(",")}${quote}`,
  );
  result = result.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_full, attrs: string, css: string) =>
      `<style${attrs}>${rewriteCss(css, base, basePath)}</style>`,
  );
  const bootstrap = `<script>window.__tinybrowserTargetUrl=${JSON.stringify(base.href).replace(/</g, "\\u003c")};window.__tinybrowserBasePath=${JSON.stringify(basePath)};</script>`;
  const injection =
    bootstrap +
    `<script src="${basePath}/tinybrowser-runtime.js" defer></script>`;
  return /<\/head>/i.test(result)
    ? result.replace(/<\/head>/i, `${injection}</head>`)
    : injection + result;
}
