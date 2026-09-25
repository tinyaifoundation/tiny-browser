import assert from "node:assert/strict";
import { test } from "node:test";
import {
  fetchTarget,
  proxyPath,
  rewriteCss,
  rewriteHtml,
  safeAddress,
  targetFromPath,
} from "./gateway.js";

test("proxy paths preserve target paths and queries", () => {
  const target = new URL("https://example.com/docs/page?q=one%20two");
  assert.equal(targetFromPath(proxyPath(target)).href, target.href);
  assert.equal(
    targetFromPath(proxyPath(target, "/tinybrowser"), "/tinybrowser").href,
    target.href,
  );
  assert.throws(() => targetFromPath("/tinybrowser/browse/http/example.com/%"));
});

test("the gateway blocks private and local addresses", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://10.0.0.4/",
    "http://[::1]/",
    "http://[::ffff:127.0.0.1]/",
    "http://localhost/",
    "https://8.8.8.8:8443/",
  ]) {
    await assert.rejects(() => safeAddress(new URL(url)));
  }
  assert.deepEqual(await safeAddress(new URL("https://8.8.8.8/")), {
    address: "8.8.8.8",
    family: 4,
  });
});

test("redirects are validated again and pinned addresses reach the request", async () => {
  const seen: string[] = [];
  const dependencies = {
    resolveAddress: safeAddress,
    requestPinned: async (target: URL, address: { address: string }) => {
      seen.push(`${target.hostname}=${address.address}`);
      return {
        status: 302,
        headers: { location: "http://127.0.0.1/private" },
        body: Buffer.alloc(0),
      };
    },
  };
  await assert.rejects(
    () => fetchTarget(new URL("https://8.8.8.8/"), 0, dependencies),
    /Private or reserved/,
  );
  assert.deepEqual(seen, ["8.8.8.8=8.8.8.8"]);
});

test("fetched responses are capped and DNS pinning is passed to transport", async () => {
  let pinned = "";
  await assert.rejects(
    () =>
      fetchTarget(new URL("https://example.com/"), 0, {
        resolveAddress: async () => ({ address: "8.8.4.4", family: 4 }),
        requestPinned: async (_target, address) => {
          pinned = address.address;
          return { status: 200, headers: {}, body: Buffer.alloc(15_000_001) };
        },
      }),
    /15 MB/,
  );
  assert.equal(pinned, "8.8.4.4");
});

test("HTML and CSS resources stay inside the first-party gateway", () => {
  const base = new URL("https://example.com/docs/page");
  const html = rewriteHtml(
    '<html><head><style>.hero{background:url(/hero.png)}</style></head><body><a href="/next">Next</a><img src="https://cdn.example.net/p.png"></body></html>',
    base,
  );
  assert.match(html, /href="\/browse\/https\/example.com\/next"/);
  assert.match(html, /src="\/browse\/https\/cdn.example.net\/p.png"/);
  assert.match(html, /url\(\/browse\/https\/example.com\/hero.png\)/);
  assert.match(html, /tinybrowser-runtime\.js/);
  assert.equal(
    rewriteCss(".x{background:url(../x.svg)}", base),
    ".x{background:url(/browse/https/example.com/x.svg)}",
  );
  const nested = rewriteHtml(
    '<a href="../next">next</a>',
    base,
    "/tinybrowser",
  );
  assert.match(
    nested,
    /href="\/tinybrowser\/browse\/https\/example.com\/next"/,
  );
  assert.match(nested, /src="\/tinybrowser\/tinybrowser-runtime.js"/);
  assert.match(nested, /__tinybrowserBasePath="\/tinybrowser"/);
});
