import type { TinyNode, TinySnapshot } from "@tinybrowser/protocol";
import { NodeRegistry } from "./nodes";
import { isVisible, rectFor } from "./visibility";

const meaningfulRoles = new Set([
  "alert", "article", "button", "cell", "checkbox", "combobox", "dialog", "heading", "img", "link",
  "main", "menuitem", "navigation", "option", "radio", "row", "tab", "table", "textbox",
]);
const interactiveTags = new Set(["a", "button", "input", "select", "textarea", "summary"]);
const ignoredTags = new Set(["script", "style", "template", "svg", "path", "noscript"]);

function clean(value: string | null | undefined): string | undefined {
  const result = value?.replace(/\s+/g, " ").trim();
  return result || undefined;
}

const implicitRoles: Record<string, string> = {
  a: "link", button: "button", h1: "heading", h2: "heading", h3: "heading", h4: "heading", h5: "heading", h6: "heading",
  img: "img", main: "main", nav: "navigation", option: "option", select: "combobox", textarea: "textbox",
};

function roleFor(element: Element): string {
  if (element === document.body) return "document";
  if (element instanceof HTMLInputElement) {
    if (element.type === "checkbox") return "checkbox";
    if (element.type === "radio") return "radio";
    return "textbox";
  }
  return element.getAttribute("role") ?? implicitRoles[element.localName] ?? "generic";
}

function labelText(element: Element): string | undefined {
  const labelledBy = element.getAttribute("aria-labelledby")?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent).filter(Boolean).join(" ");
  const labels = element instanceof HTMLInputElement || element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement
    ? [...element.labels ?? []].map((label) => label.textContent).join(" ") : "";
  return clean(element.getAttribute("aria-label") ?? labelledBy ?? labels ?? element.getAttribute("alt") ?? element.textContent);
}

function isInteractive(element: Element, role: string): boolean {
  return interactiveTags.has(element.localName) || element.hasAttribute("contenteditable") ||
    ["button", "checkbox", "combobox", "link", "menuitem", "option", "radio", "tab", "textbox"].includes(role) ||
    typeof (element as HTMLElement).onclick === "function";
}

function isMeaningful(element: Element, role: string, name: string | undefined): boolean {
  if (isInteractive(element, role) || meaningfulRoles.has(role)) return true;
  return Boolean(name && element.children.length === 0 && clean(element.textContent));
}

function nodeFor(element: Element, registry: NodeRegistry): TinyNode | undefined {
  if (ignoredTags.has(element.localName) || !isVisible(element)) return undefined;
  const role = roleFor(element);
  const name = labelText(element);
  const children = [...element.children]
    .map((child) => nodeFor(child, registry))
    .filter((node): node is TinyNode => Boolean(node));

  if (!isMeaningful(element, role, name) && children.length === 0) return undefined;

  const html = element as HTMLElement;
  const input = element as HTMLInputElement;
  const node: TinyNode = {
    id: registry.idFor(element),
    role,
    name,
    description: clean(element.getAttribute("aria-description") ?? element.getAttribute("title")),
    visible: true,
    clickable: isInteractive(element, role),
    editable: element.matches("input:not([type=checkbox]):not([type=radio]), textarea, [contenteditable=true]"),
    disabled: "disabled" in input ? input.disabled : undefined,
    checked: "checked" in input ? input.checked : undefined,
    selected: element instanceof HTMLOptionElement ? element.selected : undefined,
    expanded: element.getAttribute("aria-expanded") === "true" ? true : element.getAttribute("aria-expanded") === "false" ? false : undefined,
    tag: element.localName,
    level: role === "heading" ? Number(element.getAttribute("aria-level") ?? element.localName.slice(1)) || undefined : undefined,
    rect: rectFor(element),
    children: children.length ? children : undefined,
  };
  if (html instanceof HTMLInputElement || html instanceof HTMLTextAreaElement || html instanceof HTMLSelectElement) node.value = html.value;
  return node;
}

export function createSnapshot(registry: NodeRegistry): TinySnapshot {
  const rootElement = document.body ?? document.documentElement;
  const children = [...rootElement.children]
    .map((element) => nodeFor(element, registry))
    .filter((node): node is TinyNode => Boolean(node));
  return {
    // Scramjet virtualizes the global location object; documentURI remains a
    // stable document-level view for a runtime injected after its hooks run.
    url: document.documentURI,
    title: document.title,
    capturedAt: Date.now(),
    root: { id: 0, role: "document", name: document.title || undefined, visible: true, children },
  };
}
