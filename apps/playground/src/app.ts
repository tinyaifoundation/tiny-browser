import { TinyBrowser, type TinyPage } from "@tinybrowser/controller";
import type { TinyNode, TinySnapshot } from "@tinybrowser/protocol";
import { ScramjetBrowserAdapter } from "@tinybrowser/scramjet-adapter";
import "./style.css";

const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = byId<HTMLFormElement>("navigation-form");
const urlInput = byId<HTMLInputElement>("url");
const status = byId<HTMLOutputElement>("status");
const browserView = byId<HTMLDivElement>("browser-view");
const tree = byId<HTMLPreElement>("tree");

let page: TinyPage | undefined;
const wispUrl = import.meta.env.VITE_TINYBROWSER_WISP_URL ?? "ws://127.0.0.1:8080/wisp/";

function setStatus(message: string, error = false): void {
  status.value = message.replace(/\s*\n\s*/g, " · ");
  status.dataset.error = String(error);
}

function printNode(node: TinyNode, depth = 0): string[] {
  const indent = "  ".repeat(depth);
  const flags = [node.editable && "editable", node.clickable && "clickable", node.disabled && "disabled"]
    .filter(Boolean).map(String).join(", ");
  const label = [node.role, node.name && JSON.stringify(node.name), `[id=${node.id}]`, flags && `(${flags})`]
    .filter(Boolean).join(" ");
  return [indent + label, ...(node.children?.flatMap((child) => printNode(child, depth + 1)) ?? [])];
}

function renderSnapshot(snapshot: TinySnapshot): void {
  tree.textContent = [`${snapshot.title || "Untitled"} — ${snapshot.url}`, "", ...printNode(snapshot.root)].join("\n");
}

async function refreshTree(): Promise<void> {
  if (!page) return;
  const snapshot = await page.snapshot();
  if (!snapshot || typeof snapshot !== "object") throw new Error("TinyBrowser runtime returned an empty snapshot.");
  renderSnapshot(snapshot);
  setStatus(`Snapshot: ${snapshot.title || snapshot.url}`);
}

async function navigate(url: string): Promise<void> {
  const normalised = new URL(url).href;
  setStatus(`Loading ${normalised}…`);
  page?.dispose();
  const runtimeResponse = await fetch(new URL("/tinybrowser-runtime.js", location.origin));
  if (!runtimeResponse.ok) throw new Error("TinyBrowser runtime module was unavailable.");
  const browser = new TinyBrowser(new ScramjetBrowserAdapter({
    runtimeSource: await runtimeResponse.text(),
    wispUrl,
  }));
  await browser.start();
  page = await browser.newPage();
  page.onNavigation(() => {
    void refreshTree().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
  });
  browserView.replaceChildren(page.element);
  await page.goto(normalised);
  await refreshTree();
}

async function boot(): Promise<void> {
  setStatus("Registering Scramjet service worker…");
  await navigator.serviceWorker.register("/scramjet-sw.js?v=6", { scope: "/" });
  await navigator.serviceWorker.ready;
  // A newly registered worker does not control the registration page itself.
  // Reload once so both the controller and its first proxied iframe share the
  // active worker from the start.
  if (!navigator.serviceWorker.controller && !sessionStorage.getItem("tinybrowser:worker-reloaded")) {
    sessionStorage.setItem("tinybrowser:worker-reloaded", "true");
    location.reload();
    return;
  }
  await navigate(urlInput.value);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void navigate(urlInput.value).catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
});

byId<HTMLButtonElement>("refresh-tree").addEventListener("click", () => {
  void refreshTree().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
});

byId<HTMLFormElement>("click-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const nodeId = Number(new FormData(event.currentTarget as HTMLFormElement).get("nodeId"));
  void page?.click(nodeId).then(refreshTree).catch((error) => setStatus(error.message, true));
});

byId<HTMLFormElement>("type-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(event.currentTarget as HTMLFormElement);
  void page?.type(Number(data.get("nodeId")), String(data.get("text"))).then(refreshTree).catch((error) => setStatus(error.message, true));
});

byId<HTMLFormElement>("key-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const key = String(new FormData(event.currentTarget as HTMLFormElement).get("key"));
  void page?.press(key).then(refreshTree).catch((error) => setStatus(error.message, true));
});

void boot().catch((error) => setStatus(error instanceof Error ? error.message : String(error), true));
