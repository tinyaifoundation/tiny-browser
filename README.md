# Tiny Browser

![Tiny Browser concept artwork: an embedded web page and an agent's semantic view over a blue-green gradient](docs/assets/tiny-browser-hero.png)

**A small, web-embedded browser for agents.** Add a visible browser to your web app without running a separate server-side browser for every visitor. Tiny Browser renders pages in a sandboxed iframe in the visitor's browser, extracts a compact semantic tree, and lets an agent act on node IDs. A small relay that you deploy fetches and rewrites public pages and serves the injected runtime.

This repository contains an importable TypeScript SDK, the deployable Node relay, and a React + shadcn/ui demo. It is free and open source under MIT.

## Try it locally

Requires Node.js 22+ and pnpm 10.14+.

```bash
git clone https://github.com/tinyaifoundation/tiny-browser.git
cd tiny-browser
corepack enable
pnpm install
pnpm build
pnpm start
```

Open **http://127.0.0.1:8080**. The default `https://demo.tinybrowser/` page is a built-in fixture, so the first interaction needs no external website. Select a textbox in the semantic tree, choose **Type**, then select **Save note** and choose **Click**. The rendered page and tree update together.

For live development, use `pnpm dev` and open **http://127.0.0.1:5173**. Run `pnpm typecheck` and `pnpm test` before contributing.

## Embed it

The browser-side package is `@tinyaifoundation/tiny-browser` in [`packages/browser`](packages/browser). The demo imports it directly from this workspace. To install it in another app before npm publication:

```bash
pnpm build
pnpm --filter @tinyaifoundation/tiny-browser pack --pack-destination .
# In your app:
pnpm add /path/to/tiny-browser/tinyaifoundation-tiny-browser-0.2.0.tgz
```

The package tarball includes compiled JavaScript and TypeScript declarations with no runtime npm dependencies. Publishing the package to npm is a separate release step.

Expose the relay through your authenticated web app at `/tinybrowser/*`, then:

```ts
import {
  TinyBrowser,
  IframeBrowserAdapter,
} from "@tinyaifoundation/tiny-browser";

const browser = new TinyBrowser(
  new IframeBrowserAdapter({ basePath: "/tinybrowser" }),
);
await browser.start();
const page = await browser.newPage();
document.querySelector("#browser")!.append(page.element);
await page.goto("https://example.com/");

const snapshot = await page.snapshot();
console.log(snapshot.title, snapshot.root);
const link = snapshot.root.children?.find((node) => node.role === "link");
if (link) await page.click(link.id);
page.dispose();
```

`TinyPage` also supports `type`, `press`, `select`, `scroll`, `url`, `title`, `onTreeChanged`, and `onNavigation`. Node IDs refer to the current document; take a fresh snapshot after navigation or major DOM changes. The agent runs in your web app. Tiny Browser does not bundle an LLM or expose a public agent-control API.

## How it works

```text
Visitor's browser                         Developer's infrastructure
┌──────────────────────────────┐          ┌──────────────────────────────┐
│ Your web app + agent          │          │ Authenticated web app        │
│   TinyBrowser / TinyPage      │          │   /tinybrowser/* proxy       │
│       ↓ commands             │          │       ↓                      │
│ Sandboxed iframe             │─HTTPS───>│ Small Tiny Browser relay     │──HTTP(S)──> public sites
│   page rendering + runtime   │<─────────│ DNS check, fetch, rewrite    │
│       ↑ semantic snapshots   │          └──────────────────────────────┘
└──────────────────────────────┘
```

The visitor's existing browser executes scripts, lays out pages, renders pixels, and runs the semantic runtime. The relay performs DNS resolution, public-address validation, outbound HTTP(S) requests, HTML/CSS URL rewriting, runtime injection, and network transfer. There is no server-side Chromium, Playwright, or Puppeteer process in the normal path. The relay still consumes compute and bandwidth. This architecture is useful when the agent and human share a web app; it is not a full independent browser session or universal website compatibility layer.

## Hosted integration

See the [deployment guide](docs/deployment.md) for a runnable authenticated example, Docker instructions, configuration, security boundary, and platform notes. The example serves the same shadcn/ui demo through a web app and proxies `/tinybrowser/*` to a separate relay process. The relay requires a server-held secret and a trusted user ID on browsing and runtime requests. Browser JavaScript never receives that secret. **Use an authenticated same-origin web app and HTTPS for production traffic.** Cross-origin relay access and public CORS are outside this release.

## Limits

The relay supports GET/HEAD page and asset requests. It rewrites common static HTML attributes and CSS URLs. Dynamic `fetch`/XHR, WebSockets, service workers, POST workflows, site logins, media streams, and complex client-side routing are outside the current compatibility scope. Sites that need these features, strict origin behavior, or anti-bot challenges may not work. The semantic tree captures visible content and controls rather than the full DOM or a complete accessibility tree. Untrusted target pages can affect what the agent sees, so an agent should treat page content as untrusted input.

## Measure it

Relay performance depends on target pages, traffic, and hosting. [`scripts/benchmark-relay.mjs`](scripts/benchmark-relay.mjs) measures request latency, throughput, response bandwidth, and optionally relay process RSS/CPU. The [deployment guide](docs/deployment.md#measurement) explains the workload and comparison method. We do not claim a universal cost-per-session saving from package size alone.

## Project layout

| Path                  | Purpose                                                    |
| --------------------- | ---------------------------------------------------------- |
| `packages/browser`    | Installable SDK with types, controller, and iframe adapter |
| `packages/runtime`    | Semantic snapshot and action runtime injected into pages   |
| `server`              | Standalone HTTP relay and local demo server                |
| `apps/playground`     | React + shadcn/ui demo                                     |
| `examples/hosted-app` | Authenticated same-origin integration example              |

## Contributing and security

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md). Report security issues privately through GitHub's vulnerability reporting.

MIT license: [LICENSE](LICENSE).
