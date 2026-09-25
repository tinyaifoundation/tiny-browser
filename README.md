# Tiny Browser

**A small, web-embedded browser for agents.** Tiny Browser renders a page inside your web app, turns its visible DOM into a compact semantic tree, and lets an agent act on stable node IDs. It uses the browser already on your machine. There is no Chromium download, VM, Playwright process, Scramjet service worker, or Wisp relay.

The repository includes a local gateway, a browser-side controller and runtime, and a [shadcn/ui](https://ui.shadcn.com/) demo. It is free and open source under the MIT license.

## Quick start

You need Node.js 22 or newer and pnpm 10.14 or newer. After the public repository is available:

```bash
git clone https://github.com/tinyaifoundation/tiny-browser.git
cd tiny-browser
corepack enable
pnpm install
pnpm build
pnpm start
```

Open **http://127.0.0.1:8080**. The default `https://demo.tinybrowser/` address is a built-in local fixture; it does not depend on DNS or an outside website. Select a textbox in the semantic tree, choose **Type**, enter a note, then select **Save note** and choose **Click**. The rendered page and tree update together.

For development, run `pnpm dev` and open **http://127.0.0.1:5173**. The Vite demo runs on port 5173 and forwards browsing requests to the local gateway on port 8080. Run `pnpm typecheck` and `pnpm test` before sending a change. `pnpm test` builds the workspace and exercises gateway URL rewriting and network guardrails.

## What it provides

| Piece                     | Purpose                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `packages/protocol`       | Public `TinyNode`, `TinySnapshot`, command, and page types.                                    |
| `packages/runtime`        | Runtime injected into visited documents. Extracts visible semantic nodes and performs actions. |
| `packages/controller`     | `TinyBrowser` and `TinyPage` API in the host web app.                                          |
| `packages/iframe-adapter` | Sandboxed iframe navigation and host/runtime message transport.                                |
| `server`                  | First-party HTTP gateway and static demo server.                                               |
| `apps/playground`         | React + shadcn/ui demo and built-in interaction fixture.                                       |

The basic flow is:

```text
host web app → TinyPage → sandboxed iframe → gateway → public website
                    ↑                 ↓
                 commands       semantic runtime
                    └──── snapshot and action results ────┘
```

The gateway resolves public URLs, validates the destination address, fetches content, rewrites common HTML/CSS resource URLs into gateway paths, and injects the Tiny Browser runtime. The visited page runs in an iframe with an opaque origin. The runtime sends snapshots and action results to the host with `postMessage`; the host checks the iframe source.

## Embed it in a web app

The workspace packages are source packages today; they are not published on npm. The demo is a working integration example. In a browser-side TypeScript app in this workspace:

```ts
import { TinyBrowser } from "@tinybrowser/controller";
import { IframeBrowserAdapter } from "@tinybrowser/iframe-adapter";

const browser = new TinyBrowser(new IframeBrowserAdapter());
await browser.start();

const page = await browser.newPage();
document.querySelector("#browser")!.append(page.element);
await page.goto("https://example.com/");

const snapshot = await page.snapshot();
console.log(snapshot.title, snapshot.root.children);

const link = snapshot.root.children?.find((node) => node.role === "link");
if (link) await page.click(link.id);

page.dispose();
```

`TinyPage` supports `goto`, `snapshot`, `click`, `type`, `press`, `select`, `scroll`, `url`, and `title`. The concrete controller also exposes `onTreeChanged` and `onNavigation`. Node IDs are stable only while their elements remain in the current document; take a fresh snapshot after navigation or large DOM changes. The API is designed for an agent running in the same web app. This release does not expose an HTTP agent-control endpoint or bundle an LLM.

## Security model

The gateway listens on **127.0.0.1**. It blocks loopback, private, link-local, and reserved IP ranges; allows only standard HTTP/HTTPS ports; and validates each redirect. Its network connection uses the validated DNS address. Responses are capped at 15 MB and upstream requests time out. The iframe allows scripts and forms, but has an opaque origin and cannot open an unsandboxed tab.

The gateway removes upstream frame and content security restrictions so it can embed and inspect pages. **Keep it on localhost and do not expose it to the public Internet.** It has no user authentication or multi-user isolation. Treat visited pages as untrusted. Do not use this version for sensitive sessions or credentials.

## Current compatibility limits

Tiny Browser is a web-first browsing surface, not a full replacement for a desktop browser engine or a universal proxy. The gateway currently supports GET/HEAD page and asset requests. It rewrites common static HTML attributes and CSS URLs, but does not rewrite arbitrary JavaScript, dynamic `fetch`/XHR calls, WebSockets, service workers, media streams, or POST workflows. Sites that require these features, strict origin behavior, authentication, anti-bot challenges, or complex client-side routing may not work. The built-in demo and simple public pages are supported paths.

The semantic tree is intentionally smaller than the DOM. It includes visible text, landmarks, headings, controls, accessible names, state, and rectangles. It is not a complete accessibility tree. Synthetic key events may not reproduce every browser default action.

## Project commands

```bash
pnpm dev        # gateway + live demo
pnpm build      # compile packages and build production demo
pnpm start      # serve built demo and gateway on localhost:8080
pnpm typecheck  # check all TypeScript packages
pnpm test       # build and run gateway tests
```

Set `TINYBROWSER_PORT` to move the production server from port 8080. The development demo currently expects the gateway on port 8080. The server binds to localhost by design; public deployment would require authentication and network isolation.

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [SECURITY.md](SECURITY.md) for vulnerability reports. The nearest-term work is broader site compatibility, more faithful keyboard behavior, and a documented adapter interface for other hosts.

## License

MIT. See [LICENSE](LICENSE).
