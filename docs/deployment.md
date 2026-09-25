# Deploy Tiny Browser with your web app

Tiny Browser has two pieces: the browser SDK in your web app and a small HTTP relay that you host. The relay does not render pages. It fetches public HTML and assets, rewrites their URLs under a configured path, and injects the semantic runtime. The visitor's browser renders and runs the page.

## Run the authenticated example

Build the workspace, generate one secret with `openssl rand -hex 32`, and export that same value in both terminals:

```bash
pnpm install
pnpm build
export TINYBROWSER_PROXY_SECRET="paste-the-generated-value-here"
TINYBROWSER_MODE=relay TINYBROWSER_BASE_PATH=/tinybrowser pnpm start
```

```bash
export TINYBROWSER_PROXY_SECRET="paste-the-same-generated-value-here"
APP_USER=demo APP_PASSWORD="choose-a-long-password" node examples/hosted-app/server.mjs
```

Open **http://127.0.0.1:3000** and sign in with the example credentials. The app serves the shadcn/ui demo, injects `/tinybrowser` as the SDK base path, and proxies browsing requests to the relay. The built-in `https://demo.tinybrowser/` fixture supports a deterministic navigation, snapshot, type, and click exercise. Try a simple public page such as `https://example.com/` afterward.

The example uses HTTP Basic authentication on loopback to show the boundary in a small amount of code. In production, integrate with your app's existing session or identity provider and serve the app over HTTPS. The example's one-account configuration is for testing, not a multi-user identity system.

## Container relay

Build the Docker image from the repository root:

```bash
docker build -t tiny-browser-relay .
docker run --rm -p 127.0.0.1:8080:8080 \
  -e TINYBROWSER_PROXY_SECRET="$(openssl rand -hex 32)" \
  tiny-browser-relay
```

The secret above is illustrative: your app proxy must use the **same** value. Inject it through your deployment platform's secret manager. The image defaults to `TINYBROWSER_MODE=relay`, binds `0.0.0.0` in the container, and serves only `/tinybrowser/health`, `/tinybrowser/ready`, `/tinybrowser/tinybrowser-runtime.js`, and `/tinybrowser/browse/*`. Keep the relay on a private network or restrict ingress to the authenticated app proxy. Health and readiness routes are unauthenticated; browsing and runtime routes require both `X-TinyBrowser-Proxy-Secret` and `X-TinyBrowser-User`. The app proxy must **strip any browser-supplied copies** of these headers and set its own trusted values after checking the session.

The process handles SIGTERM/SIGINT by closing its listener. Liveness is `GET /tinybrowser/health`; readiness is `GET /tinybrowser/ready`. Both return JSON. Configure deployment health checks against the same base path.

| Variable                              | Default                        | Meaning                                               |
| ------------------------------------- | ------------------------------ | ----------------------------------------------------- |
| `TINYBROWSER_MODE`                    | `local` outside Docker         | `relay` enables hosted mode and requires a secret     |
| `TINYBROWSER_PROXY_SECRET`            | none                           | At least 32 characters; app-proxy-to-relay credential |
| `TINYBROWSER_BASE_PATH`               | `/tinybrowser` in relay mode   | Same-origin path used by SDK and URL rewriting        |
| `TINYBROWSER_HOST`                    | `0.0.0.0` in relay mode        | Container bind interface                              |
| `TINYBROWSER_PORT`                    | `PORT` or `8080` in relay mode | Listener port                                         |
| `TINYBROWSER_MAX_CONCURRENT`          | `16`                           | Concurrent requests per relay process                 |
| `TINYBROWSER_MAX_CONCURRENT_PER_USER` | `4`                            | Concurrent requests per trusted user ID               |
| `TINYBROWSER_MAX_REQUESTS_PER_MINUTE` | `120`                          | Requests per trusted user ID per minute               |
| `TINYBROWSER_MAX_BYTES_PER_MINUTE`    | `50000000`                     | Response bytes per trusted user ID per minute         |

The relay has no target-site cookie jar or server-side browser state. It does not forward browser cookies or Authorization headers to target sites. Per-user quotas are keyed by the trusted `X-TinyBrowser-User` header. One user's requests cannot read another user's relay state because no visited-page state is stored in the relay. If your application needs browsing history or agent state, isolate that in your own per-user storage.

## Use it in your own app

1. Deploy the container behind private ingress. For example, use a container service and a private service URL; set the secret in both relay and web app.
2. In your web app, authenticate the visitor on every `/tinybrowser/*` request. Reject cross-site use at your app edge, apply SameSite session cookies and CSRF controls appropriate to your auth system, and do not cache user-specific responses.
3. Forward only GET/HEAD to the relay. Overwrite `X-TinyBrowser-Proxy-Secret` and `X-TinyBrowser-User` after authentication. Do not forward visitors' cookies or Authorization headers to the relay.
4. Serve the web app over HTTPS and install `@tinyaifoundation/tiny-browser` from a built package tarball or workspace. Create `new IframeBrowserAdapter({ basePath: "/tinybrowser" })` in browser-side code.
5. Check navigation, snapshot, and actions with the built-in fixture, then test the public sites you expect to support.

[Railway supports root Dockerfiles](https://docs.railway.com/builds/dockerfiles); set the relay secret as a service variable, keep ingress private to the app where possible, and use its assigned `PORT` or set `TINYBROWSER_PORT`. [Amazon ECS runs container tasks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html); inject the secret from your secret manager and limit task ingress. A Vercel-hosted web app can use its server-side application route to authenticate and proxy to a separately hosted relay. [Vercel external rewrites](https://vercel.com/docs/routing/rewrites) forward paths, but a plain public rewrite does not provide the required per-user authentication and trusted identity headers; use an authenticated server route or equivalent trusted proxy instead. These are integration patterns, not one-click deployment manifests.

## Security checklist

- Keep the relay secret server-side. Never put it in HTML, browser JavaScript, a public config file, or a static rewrite rule.
- Authenticate every browsing/runtime request at the app edge. Strip incoming relay headers and set a stable user or tenant ID after auth.
- Require HTTPS for the public app and private or restricted app-to-relay connectivity. Avoid an open relay endpoint.
- Use your app's session SameSite/CSRF protection and restrict cross-site framing. The relay emits `frame-ancestors 'self'` for visited documents.
- Monitor 429/502 responses and set app-edge rate limits. Built-in limits are 16 concurrent relay requests, 4 per user, 120 requests per user per minute, 50 MB per user per minute, 15 MB per response, 12-second inactivity and 15-second total upstream timeouts, and at most five redirects. These are process-local defaults; put a shared limiter at your app edge if you scale to multiple replicas.
- Target URLs are limited to HTTP(S) on standard ports. The relay blocks private/reserved IPv4 and IPv6, checks each redirect, rejects mixed DNS answers containing blocked addresses, and pins the selected address for the outbound request.
- Treat target pages and their content as untrusted. Avoid credentials, payment workflows, and sensitive sessions in this release.

## Measurement

After starting a relay, run a fixed workload against a page you are allowed to fetch:

```bash
RELAY_BASE_URL=http://127.0.0.1:8080/tinybrowser \
TINYBROWSER_PROXY_SECRET="$TINYBROWSER_PROXY_SECRET" \
BENCHMARK_URL=https://example.com/ \
BENCHMARK_REQUESTS=100 BENCHMARK_CONCURRENCY=8 \
RELAY_PID=<relay-process-pid> \
node scripts/benchmark-relay.mjs
```

The script reports successes/failures, elapsed time, requests per second, p50/p95 latency, total response bytes and response MiB/s. With `RELAY_PID`, it samples process RSS and CPU using `ps`. Response bytes measure relay-to-client payload, including rewriting; they are not a full billable network estimate. Measure upstream transfer and infrastructure billing separately. Check the built relay size with `du -sh server/dist` and container size with `docker image inspect tiny-browser-relay --format '{{.Size}}'` on a machine with Docker.

One local sample on macOS arm64 with Node.js 25.9.0, `https://example.com/`, 100 requests and concurrency 4: 100 succeeded in 0.74 seconds, p50 25.7 ms, p95 35.1 ms, 75,600 response bytes, sampled peak RSS 55.2 MiB, and sampled average process CPU 9.5%. The built relay directory was 60 KiB, the SDK output directory 36 KiB, and the packed SDK tarball 4,871 bytes. These are a short development-machine sample, not capacity or billing estimates. Docker was unavailable in this environment, so container size has not been measured.

For a comparison with self-hosted Playwright/Chromium or a managed browser, run the **same target URLs, actions, session count, concurrency, duration, region, and cache policy**. Record server CPU/RSS, outbound bytes, startup time, throughput, and total vendor/network cost. This script measures the relay HTTP path; it does not benchmark a browser renderer or agent model. The built-in fixture is useful for repeatability but does not represent external network latency.

## From the original local demo

`pnpm start` still runs the combined demo and relay on `127.0.0.1:8080` with root paths and no authentication. It is for local single-user development. Hosted operation uses `TINYBROWSER_MODE=relay`, a secret, and `/tinybrowser` by default. Change the adapter from `new IframeBrowserAdapter()` to `new IframeBrowserAdapter({ basePath: "/tinybrowser" })` and move authentication into your web app proxy. Keep the same prefix in the SDK, relay, and app proxy.

## Compatibility

GET/HEAD and common static HTML/CSS resources are supported. Dynamic `fetch`/XHR, WebSockets, service workers, POST workflows, authenticated target sites, media streams, and complex single-page apps are outside the current scope. The browser iframe uses an opaque sandboxed origin. Some sites refuse embedding or rely on browser features that this relay does not reproduce. Test the sites relevant to your app.
