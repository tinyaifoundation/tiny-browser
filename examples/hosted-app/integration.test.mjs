import assert from "node:assert/strict";
import { test } from "node:test";
import { createRelayServer } from "../../server/dist/index.js";

test("authenticated hosted app proxies a non-root relay without exposing its secret", async () => {
  const secret = "integration-secret-" + "x".repeat(32);
  const relay = createRelayServer({
    mode: "relay",
    host: "127.0.0.1",
    port: 0,
    basePath: "/tinybrowser",
    proxySecret: secret,
  });
  await new Promise((resolve) => relay.listen(0, "127.0.0.1", resolve));
  const relayPort = relay.address().port;
  process.env.RELAY_URL = `http://127.0.0.1:${relayPort}`;
  process.env.TINYBROWSER_PROXY_SECRET = secret;
  process.env.APP_USER = "alice";
  process.env.APP_PASSWORD = "password";
  const { createAppServer } = await import("./server.mjs");
  const app = createAppServer();
  await new Promise((resolve) => app.listen(0, "127.0.0.1", resolve));
  const appPort = app.address().port;
  const base = `http://127.0.0.1:${appPort}`;
  const auth = {
    authorization: `Basic ${Buffer.from("alice:password").toString("base64")}`,
  };
  try {
    const direct = await fetch(
      `http://127.0.0.1:${relayPort}/tinybrowser/browse/https/demo.tinybrowser/`,
    );
    assert.equal(direct.status, 401);
    const directRuntime = await fetch(
      `http://127.0.0.1:${relayPort}/tinybrowser/tinybrowser-runtime.js`,
    );
    assert.equal(directRuntime.status, 401);
    const anonymous = await fetch(
      `${base}/tinybrowser/browse/https/demo.tinybrowser/`,
    );
    assert.equal(anonymous.status, 401);
    const spoofed = await fetch(
      `${base}/tinybrowser/browse/https/demo.tinybrowser/`,
      {
        headers: {
          "x-tinybrowser-proxy-secret": secret,
          "x-tinybrowser-user": "alice",
        },
      },
    );
    assert.equal(spoofed.status, 401);
    const page = await fetch(
      `${base}/tinybrowser/browse/https/demo.tinybrowser/`,
      { headers: auth },
    );
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /\/tinybrowser\/tinybrowser-runtime\.js/);
    assert.match(html, /__tinybrowserBasePath="\/tinybrowser"/);
    const runtime = await fetch(`${base}/tinybrowser/tinybrowser-runtime.js`, {
      headers: auth,
    });
    assert.equal(runtime.status, 200);
    assert.match(await runtime.text(), /tinybrowser:ready/);
    const home = await fetch(base, { headers: auth });
    assert.equal(home.status, 200);
    assert.match(
      await home.text(),
      /__tinybrowserRelayBasePath="\/tinybrowser"/,
    );
  } finally {
    await new Promise((resolve) => app.close(resolve));
    await new Promise((resolve) => relay.close(resolve));
  }
});
