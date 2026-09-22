export class NodeRegistry {
  private readonly ids = new WeakMap<Element, number>();
  private readonly elements = new Map<number, Element>();
  private nextId = 1;

  idFor(element: Element): number {
    let id = this.ids.get(element);
    if (id === undefined) {
      id = this.nextId++;
      this.ids.set(element, id);
      this.elements.set(id, element);
    }
    return id;
  }

  get(id: number): Element {
    const element = this.elements.get(id);
    if (!element || !element.isConnected) {
      throw new Error(`TinyNode ${id} is no longer present in this document.`);
    }
    return element;
  }
}
