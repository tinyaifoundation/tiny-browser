import type {
  TinyCommand,
  TinyCommandInput,
  TinyPage as TinyPageContract,
  TinyRuntimeMessage,
  TinyScrollOptions,
  TinySnapshot,
} from "@tinybrowser/protocol";

export interface FrameAdapter {
  element: HTMLIFrameElement;
  goto(url: string): Promise<void>;
  /** Optional direct channel for an adapter with its own message transport. */
  onRuntimeMessage?(
    listener: (message: TinyRuntimeMessage) => void,
  ): () => void;
  /** Optional paired direct channel for commands sent into the runtime. */
  sendRuntimeCommand?(command: TinyCommand): void;
  destroy?(): void;
}

export interface BrowserAdapter {
  start(): Promise<void>;
  createFrame(): Promise<FrameAdapter>;
}

export class TinyBrowser {
  constructor(private readonly adapter: BrowserAdapter) {}

  async start(): Promise<void> {
    await this.adapter.start();
  }

  async newPage(): Promise<TinyPage> {
    return new TinyPage(await this.adapter.createFrame());
  }
}

export class TinyPage implements TinyPageContract {
  private sequence = 0;
  private unsubscribeRuntime?: () => void;
  private readonly navigationListeners = new Set<(url: string) => void>();
  private readonly changeListeners = new Set<() => void>();
  private readonly pending = new Map<
    string,
    { resolve(value: unknown): void; reject(reason: Error): void }
  >();
  private readonly receiveMessage = (message: TinyRuntimeMessage) => {
    if (message.type === "tinybrowser:navigate") {
      void this.navigateInFrame(message.url);
      return;
    }
    if (message.type === "tinybrowser:tree-changed") {
      for (const listener of this.changeListeners) listener();
      return;
    }
    if (message.type === "tinybrowser:response") {
      const request = this.pending.get(message.id);
      if (request) {
        this.pending.delete(message.id);
        request.resolve(message.value);
      }
    }
    if (message.type === "tinybrowser:error") {
      const request = this.pending.get(message.id);
      if (request) {
        this.pending.delete(message.id);
        request.reject(new Error(message.message));
      }
    }
  };
  private readonly receiveWindowMessage = (
    event: MessageEvent<TinyRuntimeMessage>,
  ) => {
    if (event.source !== this.frame.element.contentWindow) return;
    this.receiveMessage(event.data);
  };

  constructor(private readonly frame: FrameAdapter) {
    if (frame.onRuntimeMessage)
      this.unsubscribeRuntime = frame.onRuntimeMessage(this.receiveMessage);
    else window.addEventListener("message", this.receiveWindowMessage);
  }

  get element(): HTMLIFrameElement {
    return this.frame.element;
  }

  async goto(url: string): Promise<void> {
    await this.frame.goto(url);
  }
  snapshot(): Promise<TinySnapshot> {
    return this.send({ type: "snapshot" }) as Promise<TinySnapshot>;
  }
  click(nodeId: number): Promise<void> {
    return this.send({ type: "click", nodeId }) as Promise<void>;
  }
  type(nodeId: number, text: string): Promise<void> {
    return this.send({ type: "type", nodeId, text }) as Promise<void>;
  }
  press(key: string): Promise<void> {
    return this.send({ type: "press", key }) as Promise<void>;
  }
  scroll(options: TinyScrollOptions): Promise<void> {
    return this.send({ type: "scroll", options }) as Promise<void>;
  }
  select(nodeId: number, value: string): Promise<void> {
    return this.send({ type: "select", nodeId, value }) as Promise<void>;
  }
  url(): Promise<string> {
    return this.send({ type: "getUrl" }) as Promise<string>;
  }
  title(): Promise<string> {
    return this.send({ type: "getTitle" }) as Promise<string>;
  }

  /** Subscribe to navigations requested by a target page's popup/new-tab UI. */
  onNavigation(listener: (url: string) => void): () => void {
    this.navigationListeners.add(listener);
    return () => this.navigationListeners.delete(listener);
  }

  onTreeChanged(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  dispose(): void {
    for (const request of this.pending.values())
      request.reject(new Error("Page was closed."));
    this.pending.clear();
    this.unsubscribeRuntime?.();
    window.removeEventListener("message", this.receiveWindowMessage);
    this.frame.destroy?.();
  }

  private send(command: TinyCommandInput): Promise<unknown> {
    const id = `tiny-${++this.sequence}`;
    return new Promise((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "TinyBrowser runtime did not respond. Ensure the target document received the injected runtime.",
          ),
        );
      }, 10_000);
      this.pending.set(id, {
        resolve: (value) => {
          window.clearTimeout(timeout);
          resolve(value);
        },
        reject: (reason) => {
          window.clearTimeout(timeout);
          reject(reason);
        },
      });
      const message = { ...command, id } as TinyCommand;
      if (this.frame.sendRuntimeCommand) this.frame.sendRuntimeCommand(message);
      else this.frame.element.contentWindow?.postMessage(message, "*");
    });
  }

  private async navigateInFrame(url: string): Promise<void> {
    try {
      await this.frame.goto(url);
      for (const listener of this.navigationListeners) listener(url);
    } catch (error) {
      console.error("TinyBrowser could not navigate the embedded frame", error);
    }
  }
}
