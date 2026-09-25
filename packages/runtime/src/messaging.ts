import type {
  TinyCommand,
  TinyRuntimeMessage,
  TinyScrollOptions,
} from "@tinyaifoundation/tiny-browser";
import { clickElement, pressKey, selectValue, typeInto } from "./actions";
import { NodeRegistry } from "./nodes";
import { createSnapshot } from "./tree";

function scroll(options: TinyScrollOptions, registry: NodeRegistry): void {
  if ("nodeId" in options) {
    registry.get(options.nodeId).scrollIntoView({
      block: options.block ?? "center",
      inline: options.inline ?? "nearest",
    });
    return;
  }
  window.scrollBy({
    left: options.x ?? 0,
    top: options.y ?? 0,
    behavior: options.behavior ?? "auto",
  });
}

function postToHost(message: TinyRuntimeMessage): void {
  const bridge = (document.documentElement as TinyBridgeElement)
    .__tinybrowserHostReceive;
  if (bridge) bridge(message);
  else parent.postMessage(message, "*");
}

function targetUrl(value: string): string {
  const resolved = new URL(value, document.baseURI);
  const basePath =
    (window as Window & { __tinybrowserBasePath?: string })
      .__tinybrowserBasePath ?? "";
  const browse = `${basePath}/browse/`;
  const match = resolved.pathname.startsWith(browse)
    ? /^(https?)\/([^/]+)(\/.*)?$/.exec(resolved.pathname.slice(browse.length))
    : null;
  if (match)
    return `${match[1]}://${match[2]}${match[3] ?? "/"}${resolved.search}${resolved.hash}`;
  return resolved.href;
}

function navigateInFrame(value: string): void {
  try {
    postToHost({ type: "tinybrowser:navigate", url: targetUrl(value) });
  } catch {
    // Ignore malformed destinations rather than navigating the host page.
  }
}

type SubmitControl = HTMLButtonElement | HTMLInputElement;

function submitControlFor(source: Element): SubmitControl | undefined {
  const control = source.closest("button, input");
  if (
    !(control instanceof HTMLButtonElement) &&
    !(control instanceof HTMLInputElement)
  )
    return undefined;
  return control.type.toLowerCase() === "submit" ? control : undefined;
}

function navigateGetForm(
  form: HTMLFormElement,
  submitter?: SubmitControl,
): boolean {
  if (form.method.toLowerCase() !== "get") return false;
  if (!form.checkValidity()) {
    form.reportValidity();
    return true;
  }
  const action =
    submitter?.getAttribute("formaction") ||
    form.getAttribute("action") ||
    document.baseURI;
  const url = new URL(action, document.baseURI);
  const query = new URLSearchParams(url.search);
  for (const [name, value] of new FormData(form)) {
    if (typeof value === "string") query.append(name, value);
  }
  if (submitter?.name) query.append(submitter.name, submitter.value);
  url.search = query.toString();
  navigateInFrame(url.href);
  return true;
}

function installSingleFrameNavigation(): void {
  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const source = event.target;
      if (!(source instanceof Element)) return;
      const link = source.closest("a[href]") as HTMLAnchorElement | null;
      if (!link || link.getAttribute("href")?.startsWith("#")) return;
      event.preventDefault();
      navigateInFrame(link.getAttribute("href") ?? link.href);
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (event.defaultPrevented || event.button !== 0) return;
      const source = event.target;
      if (!(source instanceof Element)) return;
      const submitter = submitControlFor(source);
      const form = submitter?.form;
      // Capture clicks before framework handlers (including Brave's) get an
      // opportunity to call window.open for an otherwise ordinary GET search.
      if (!form || !navigateGetForm(form, submitter)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  document.addEventListener(
    "submit",
    (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || !navigateGetForm(form)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    },
    true,
  );

  const openInFrame = ((url?: string | URL) => {
    if (url) navigateInFrame(String(url));
    // Return the current frame so ordinary popup code can still use a Window
    // object without creating an unsandboxed top-level tab.
    return window;
  }) as typeof window.open;
  try {
    Object.defineProperty(window, "open", {
      configurable: true,
      writable: true,
      value: openInFrame,
    });
  } catch {
    try {
      window.open = openInFrame;
    } catch {
      /* The iframe sandbox still blocks popups. */
    }
  }
}

type TinyBridgeElement = HTMLElement & {
  __tinybrowserHostReceive?: (value: TinyRuntimeMessage) => void;
  __tinybrowserSetCommandHandler?: (
    handler: (command: TinyCommand) => void,
  ) => void;
};

export function installMessaging(): void {
  const registry = new NodeRegistry();
  installSingleFrameNavigation();
  let changeTimer: number | undefined;
  const notifyChanged = () => {
    window.clearTimeout(changeTimer);
    changeTimer = window.setTimeout(
      () => postToHost({ type: "tinybrowser:tree-changed" }),
      75,
    );
  };

  new MutationObserver(notifyChanged).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  const handleCommand = (command: TinyCommand): void => {
    try {
      let value: unknown;
      switch (command.type) {
        case "snapshot":
          value = createSnapshot(registry);
          break;
        case "click":
          clickElement(registry.get(command.nodeId));
          break;
        case "type":
          typeInto(registry.get(command.nodeId), command.text);
          break;
        case "press":
          pressKey(command.key);
          break;
        case "select":
          selectValue(registry.get(command.nodeId), command.value);
          break;
        case "scroll":
          scroll(command.options, registry);
          break;
        case "getUrl":
          value =
            (window as Window & { __tinybrowserTargetUrl?: string })
              .__tinybrowserTargetUrl ?? location.href;
          break;
        case "getTitle":
          value = document.title;
          break;
      }
      postToHost({ type: "tinybrowser:response", id: command.id, value });
    } catch (error) {
      const detail = error as { message?: unknown; stack?: unknown };
      const message = `${typeof detail.message === "string" ? detail.message : String(error)}\n${typeof detail.stack === "string" ? detail.stack : ""}`;
      postToHost({ type: "tinybrowser:error", id: command.id, message });
    }
  };
  window.addEventListener("message", (event: MessageEvent<TinyCommand>) => {
    if (event.source !== parent) return;
    const command = event.data;
    if (
      !command ||
      typeof command !== "object" ||
      !("type" in command) ||
      !("id" in command)
    )
      return;
    handleCommand(command);
  });
  (
    document.documentElement as TinyBridgeElement
  ).__tinybrowserSetCommandHandler?.(handleCommand);
  postToHost({ type: "tinybrowser:ready" });
}
