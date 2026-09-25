import type { BrowserAdapter, FrameAdapter } from "./controller.js";

export interface IframeBrowserAdapterOptions {
  /** Same-origin path at which the host application exposes the relay. */
  basePath?: string;
}

export function normalizeBasePath(value = ""): string {
  if (value === "" || value === "/") return "";
  if (
    !/^\/[A-Za-z0-9._~/-]+$/.test(value) ||
    value.includes("//") ||
    value.split("/").some((segment) => segment === "." || segment === "..")
  )
    throw new Error("basePath must be a same-origin absolute path.");
  return value.replace(/\/+$/, "");
}

/** A sandboxed, web-native frame backed by TinyBrowser's own URL gateway. */
export class IframeBrowserAdapter implements BrowserAdapter {
  private readonly basePath: string;

  constructor(options: IframeBrowserAdapterOptions = {}) {
    this.basePath = normalizeBasePath(options.basePath);
  }

  async start(): Promise<void> {
    const response = await fetch(`${this.basePath}/health`, {
      credentials: "same-origin",
    });
    if (!response.ok) throw new Error("TinyBrowser gateway is unavailable.");
  }

  async createFrame(): Promise<FrameAdapter> {
    const element = document.createElement("iframe");
    element.className = "tinybrowser-frame";
    element.title = "Embedded browser page";
    element.referrerPolicy = "no-referrer";
    // Opaque origin prevents a visited page from reading the host UI or other pages.
    element.sandbox.add("allow-scripts", "allow-forms", "allow-modals");
    let cancelNavigation: (() => void) | undefined;
    return {
      element,
      goto: (url) => {
        cancelNavigation?.();
        return new Promise<void>((resolve, reject) => {
          const target = new URL(url);
          if (!["http:", "https:"].includes(target.protocol)) {
            reject(new Error("Only HTTP and HTTPS pages can be opened."));
            return;
          }
          const cleanup = () => {
            window.clearTimeout(timeout);
            window.removeEventListener("message", onReady);
            cancelNavigation = undefined;
          };
          const timeout = window.setTimeout(() => {
            cleanup();
            reject(new Error(`Timed out loading ${target.href}`));
          }, 20_000);
          const onReady = (event: MessageEvent) => {
            if (event.source !== element.contentWindow) return;
            if (event.data?.type === "tinybrowser:load-error") {
              cleanup();
              reject(
                new Error(String(event.data.message ?? "Could not load page.")),
              );
              return;
            }
            if (event.data?.type !== "tinybrowser:ready") return;
            cleanup();
            resolve();
          };
          cancelNavigation = () => {
            cleanup();
            resolve();
          };
          window.addEventListener("message", onReady);
          element.src = `${this.basePath}/browse/${target.protocol.slice(0, -1)}/${target.host}${target.pathname}${target.search}${target.hash}`;
        });
      },
      onRuntimeMessage: (listener) => {
        const receive = (event: MessageEvent) => {
          if (
            event.source === element.contentWindow &&
            event.data?.type?.startsWith?.("tinybrowser:")
          )
            listener(event.data);
        };
        window.addEventListener("message", receive);
        return () => window.removeEventListener("message", receive);
      },
      destroy: () => {
        cancelNavigation?.();
        element.remove();
      },
    };
  }
}
