import assert from "node:assert/strict";
import { test } from "node:test";
import {
  proxyPath,
  rewriteCss,
  rewriteHtml,
  safeAddress,
  targetFromPath,
} from "./gateway.js";

test("proxy paths preserve target paths and queries", () => {
  const target = new URL("https://example.com/docs/page?q=one%20two");
  assert.equal(targetFromPath(proxyPath(target)).href, target.href);
});

test("the gateway blocks private and local addresses", async () => {
  for (const url of [
    "http://127.0.0.1/",
    "http://10.0.0.4/",
    "http://[::1]/",
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
});
