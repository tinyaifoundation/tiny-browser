import type { BrowserAdapter, FrameAdapter } from "@tinybrowser/controller";

/** A sandboxed, web-native frame backed by TinyBrowser's own URL gateway. */
export class IframeBrowserAdapter implements BrowserAdapter {
  async start(): Promise<void> {
    const response = await fetch("/health");
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
          element.src = `/browse/${target.protocol.slice(0, -1)}/${target.host}${target.pathname}${target.search}${target.hash}`;
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
