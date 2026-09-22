import EpoxyTransport from "@mercuryworkshop/epoxy-transport";
import { Controller } from "@mercuryworkshop/scramjet-controller";
import { defaultConfigDev, Tap } from "@mercuryworkshop/scramjet";
import type { BrowserAdapter, FrameAdapter } from "@tinybrowser/controller";
import type { TinyCommand, TinyRuntimeMessage } from "@tinybrowser/protocol";

export interface ScramjetBrowserOptions {
  /** Self-contained module code injected into every proxied top-level document. */
  runtimeSource: string;
  /** Local Wisp endpoint, normally ws://127.0.0.1:8080/wisp/. */
  wispUrl: string;
}

/**
 * Isolates Scramjet's current controller API behind TinyBrowser's small
 * browser/frame contract. The controller uses Epoxy directly over Wisp,
 * avoiding the retired BareMux bridge.
 */
export class ScramjetBrowserAdapter implements BrowserAdapter {
  private controller?: Controller;

  constructor(private readonly options: ScramjetBrowserOptions) {}

  async start(): Promise<void> {
    if (this.controller) return;
    const serviceworker = navigator.serviceWorker.controller;
    if (!serviceworker) {
      throw new Error("Scramjet's service worker is not controlling this page yet. Reload and try again.");
    }
    const transport = new EpoxyTransport({ wisp: this.options.wispUrl });
    await transport.init();
    this.controller = new Controller({
      serviceworker,
      transport,
      scramjetConfig: defaultConfigDev,
    });
    await this.controller.wait();
  }

  async createFrame(): Promise<FrameAdapter> {
    if (!this.controller) throw new Error("Call start() before creating a Scramjet frame.");
    const frame = this.controller.createFrame();
    frame.element.className = "tinybrowser-frame";
    // TinyBrowser v0 is a single-tab surface. Never let target pages create
    // an uncontained top-level browsing context if they bypass runtime hooks.
    frame.element.sandbox.add("allow-scripts", "allow-same-origin", "allow-forms", "allow-modals", "allow-downloads", "allow-pointer-lock");
    let runtimeReceiver: (message: TinyRuntimeMessage) => void = () => undefined;
    let runtimeCommandHandler: ((command: TinyCommand) => void) | undefined;
    let injectionHookInstalled = false;
    let completeLoad: (() => void) | undefined;
    let failLoad: ((error: unknown) => void) | undefined;
    return {
      element: frame.element,
      goto: (url) => new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`Timed out loading ${url}`)), 20_000);
        if (!injectionHookInstalled) {
          injectionHookInstalled = true;
          Tap.tap(frame.hooks.init.post, ({ client, isTopLevel }) => {
            if (!isTopLevel) return;
            void this.injectRuntime(client, (message) => {
              runtimeReceiver(message);
              if (message.type === "tinybrowser:ready") completeLoad?.();
            }, (handler) => { runtimeCommandHandler = handler; }).catch((error: unknown) => {
              failLoad?.(error);
            });
          });
        }
        completeLoad = () => { window.clearTimeout(timeout); completeLoad = undefined; failLoad = undefined; resolve(); };
        failLoad = (error) => { window.clearTimeout(timeout); completeLoad = undefined; failLoad = undefined; reject(error); };
        frame.go(url);
      }),
      onRuntimeMessage: (listener) => {
        runtimeReceiver = listener;
        return () => { runtimeReceiver = () => undefined; };
      },
      sendRuntimeCommand: (command) => {
        if (!runtimeCommandHandler) throw new Error("TinyBrowser runtime is not ready to receive commands.");
        runtimeCommandHandler(command);
      },
      destroy: () => frame.element.remove(),
    };
  }

  private injectRuntime(
    client: TinyClient,
    receive: (message: TinyRuntimeMessage) => void,
    setCommandHandler: (handler: (command: TinyCommand) => void) => void,
  ): Promise<void> {
    return this.injectIntoDocument(client.global.document, receive, setCommandHandler);
  }

  private async injectIntoDocument(
    document: Document,
    receive: (message: TinyRuntimeMessage) => void,
    setCommandHandler: (handler: (command: TinyCommand) => void) => void,
  ): Promise<void> {
    await this.waitForBody(document);
    if (document.querySelector("script[data-tinybrowser-runtime]")) return Promise.resolve();
    const bridge = document.documentElement as TinyBridgeElement;
    bridge.__tinybrowserHostReceive = receive;
    bridge.__tinybrowserSetCommandHandler = setCommandHandler;
    const script = document.createElement("script");
    script.dataset.tinybrowserRuntime = "true";
    script.textContent = this.options.runtimeSource;
    (document.head ?? document.documentElement).append(script);
  }

  private waitForBody(document: Document): Promise<void> {
    return new Promise((resolve, reject) => {
      const deadline = Date.now() + 15_000;
      const check = () => {
        if (document.body) { resolve(); return; }
        if (Date.now() >= deadline) { reject(new Error("Timed out waiting for the proxied document body.")); return; }
        window.setTimeout(check, 10);
      };
      check();
    });
  }
}

type TinyClient = {
  global: Window;
  descriptors: { get(path: string, target: object): unknown; set(path: string, target: object, value: unknown): unknown };
  natives: { call(path: string, target: object, ...args: unknown[]): unknown };
};

type TinyBridgeElement = HTMLElement & {
  __tinybrowserHostReceive?: (message: TinyRuntimeMessage) => void;
  __tinybrowserSetCommandHandler?: (handler: (command: TinyCommand) => void) => void;
};
