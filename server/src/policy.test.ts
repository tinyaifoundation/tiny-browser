import assert from "node:assert/strict";
import { test } from "node:test";
import type { IncomingMessage } from "node:http";
import { authenticatedUser, RelayQuota } from "./policy.js";
import { configFromEnv } from "./index.js";

test("hosted mode cannot start without a strong secret; local mode stays loopback", () => {
  assert.throws(() => configFromEnv({ TINYBROWSER_MODE: "relay" }), /secret/i);
  assert.equal(
    configFromEnv({ TINYBROWSER_MODE: "local", TINYBROWSER_HOST: "0.0.0.0" })
      .host,
    "127.0.0.1",
  );
  assert.equal(
    configFromEnv({
      TINYBROWSER_MODE: "relay",
      TINYBROWSER_PROXY_SECRET: "x".repeat(32),
      PORT: "3000",
    }).port,
    3000,
  );
  assert.equal(
    configFromEnv({ TINYBROWSER_MAX_CONCURRENT_PER_USER: "2" }).limits
      ?.maxConcurrentPerUser,
    2,
  );
  assert.throws(
    () => configFromEnv({ TINYBROWSER_MAX_REQUESTS_PER_MINUTE: "0" }),
    /positive integer/,
  );
  assert.throws(
    () => configFromEnv({ TINYBROWSER_BASE_PATH: "/bad/<script>" }),
    /BASE_PATH/,
  );
});

test("proxy secret and trusted identity are both required", () => {
  const request = (headers: Record<string, string>) =>
    ({ headers }) as unknown as IncomingMessage;
  const secret = "s".repeat(32);
  assert.equal(authenticatedUser(request({}), secret), undefined);
  assert.equal(
    authenticatedUser(
      request({
        "x-tinybrowser-proxy-secret": "wrong",
        "x-tinybrowser-user": "alice",
      }),
      secret,
    ),
    undefined,
  );
  assert.equal(
    authenticatedUser(
      request({
        "x-tinybrowser-proxy-secret": secret,
        "x-tinybrowser-user": "alice",
      }),
      secret,
    ),
    "alice",
  );
});

test("quotas isolate users and bound concurrency, requests and bytes", () => {
  let now = 0;
  const quota = new RelayQuota(
    {
      maxConcurrent: 2,
      maxConcurrentPerUser: 1,
      maxRequestsPerMinute: 2,
      maxBytesPerMinute: 10,
    },
    () => now,
  );
  const alice = quota.acquire("alice");
  assert.ok(alice);
  assert.equal(quota.acquire("alice"), undefined);
  const bob = quota.acquire("bob");
  assert.ok(bob);
  assert.equal(quota.acquire("charlie"), undefined);
  assert.equal(quota.charge("alice", 8), true);
  assert.equal(quota.charge("alice", 3), false);
  alice();
  bob();
  const again = quota.acquire("alice");
  assert.ok(again);
  again();
  assert.equal(quota.acquire("alice"), undefined);
  now += 60_000;
  assert.ok(quota.acquire("alice"));
});
