function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  descriptor?.set?.call(element, value);
}

export function clickElement(element: Element): void {
  if (element instanceof HTMLElement) element.focus({ preventScroll: true });
  (element as HTMLElement).click();
}

export function typeInto(element: Element, text: string): void {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    element.focus();
    setNativeValue(element, text);
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    element.focus();
    element.textContent = text;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return;
  }
  throw new Error("TinyNode is not an editable input.");
}

export function pressKey(key: string): void {
  const target = document.activeElement ?? document.body;
  target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  target.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true }));
}

export function selectValue(element: Element, value: string): void {
  if (!(element instanceof HTMLSelectElement)) throw new Error("TinyNode is not a select element.");
  element.value = value;
  element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}
