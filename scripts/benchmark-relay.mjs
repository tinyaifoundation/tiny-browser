import { execFileSync } from "node:child_process";
import { performance } from "node:perf_hooks";

const base = process.env.RELAY_BASE_URL ?? "http://127.0.0.1:8080/tinybrowser";
const secret = process.env.TINYBROWSER_PROXY_SECRET;
const user = process.env.RELAY_USER ?? "benchmark";
const target = process.env.BENCHMARK_URL ?? "https://demo.tinybrowser/";
const requests = Number(process.env.BENCHMARK_REQUESTS ?? 100);
const concurrency = Number(process.env.BENCHMARK_CONCURRENCY ?? 8);
const pid = process.env.RELAY_PID;
if (!secret)
  throw new Error("Set TINYBROWSER_PROXY_SECRET for the relay benchmark.");
if (
  !Number.isInteger(requests) ||
  requests < 1 ||
  !Number.isInteger(concurrency) ||
  concurrency < 1
)
  throw new Error("Request count and concurrency must be positive integers.");
const url = new URL(target);
const path = `${base.replace(/\/$/, "")}/browse/${url.protocol.slice(0, -1)}/${url.host}${url.pathname}${url.search}`;
const headers = {
  "x-tinybrowser-proxy-secret": secret,
  "x-tinybrowser-user": user,
};
let peakRssKb = 0;
let sumCpu = 0;
let cpuSamples = 0;
const timer = pid
  ? setInterval(() => {
      try {
        const value = execFileSync("ps", ["-o", "rss=,%cpu=", "-p", pid], {
          encoding: "utf8",
        }).trim();
        const [rss, cpu] = value.split(/\s+/).map(Number);
        if (Number.isFinite(rss)) peakRssKb = Math.max(peakRssKb, rss);
        if (Number.isFinite(cpu)) {
          sumCpu += cpu;
          cpuSamples++;
        }
      } catch {
        /* Process may have exited. */
      }
    }, 100)
  : undefined;
const latencies = [];
let bytes = 0;
let succeeded = 0;
let failed = 0;
let next = 0;
const start = performance.now();
async function worker() {
  while (next < requests) {
    next++;
    const began = performance.now();
    try {
      const response = await fetch(path, { headers });
      const body = await response.arrayBuffer();
      latencies.push(performance.now() - began);
      bytes += body.byteLength;
      if (response.ok) succeeded++;
      else failed++;
    } catch {
      failed++;
    }
  }
}
await Promise.all(
  Array.from({ length: Math.min(concurrency, requests) }, worker),
);
if (timer) clearInterval(timer);
const elapsed = (performance.now() - start) / 1000;
latencies.sort((a, b) => a - b);
const percentile = (p) =>
  latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ??
  null;
console.log(
  JSON.stringify(
    {
      target,
      requests,
      concurrency,
      succeeded,
      failed,
      durationSeconds: +elapsed.toFixed(2),
      requestsPerSecond: +(requests / elapsed).toFixed(2),
      p50Ms: percentile(0.5) === null ? null : +percentile(0.5).toFixed(1),
      p95Ms: percentile(0.95) === null ? null : +percentile(0.95).toFixed(1),
      responseBytes: bytes,
      responseMibPerSecond: +(bytes / elapsed / 1048576).toFixed(3),
      peakRssMib: pid ? +(peakRssKb / 1024).toFixed(1) : null,
      averageCpuPercent:
        pid && cpuSamples ? +(sumCpu / cpuSamples).toFixed(1) : null,
    },
    null,
    2,
  ),
);
if (failed) process.exitCode = 1;
