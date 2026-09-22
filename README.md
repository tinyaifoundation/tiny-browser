# TinyBrowser

An experimental, in-browser agent browser. The first milestone is deliberately small:

1. Load a proxied site in an iframe through Scramjet.
2. Inject a TinyBrowser runtime into that document.
3. Convert useful DOM content into a compact, agent-oriented `TinyTree`.
4. Click, type, select, scroll, and press keys by stable TinyNode IDs.

The host browser is still the renderer. The local Wisp relay transports network traffic; it does not execute webpages or run a remote browser.

## Run locally

```sh
pnpm install
pnpm dev
```

Open `http://127.0.0.1:5173`. The playground has the site at left and the agent-visible semantic tree at right. Start with the bundled test page at `http://127.0.0.1:5173/test-site/` before trying arbitrary public websites.

## Workspace

- `apps/playground` — the visual browser laboratory and inspector.
- `packages/protocol` — TinyBrowser’s engine-independent public contracts.
- `packages/runtime` — the injected semantic-tree and action runtime.
- `packages/controller` — the `TinyBrowser` / `TinyPage` API.
- `packages/scramjet-adapter` — the Scramjet integration boundary.
- `server` — the local Wisp relay on port 8080.

## Intentional v0 limits

- No `evaluate()` API.
- No LLM integration, tabs, history UI, or polished browser chrome.
- No claim that every site or authentication flow will work in a framed/proxied context.
- The runtime reports a full tree now; diff events come after the basic deterministic loop is dependable.
