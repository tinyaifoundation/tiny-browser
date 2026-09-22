export interface TinyRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TinyNode {
  id: number;
  role: string;
  name?: string;
  description?: string;
  value?: string;
  visible: boolean;
  disabled?: boolean;
  checked?: boolean;
  selected?: boolean;
  expanded?: boolean;
  editable?: boolean;
  clickable?: boolean;
  tag?: string;
  level?: number;
  rect?: TinyRect;
  children?: TinyNode[];
}

export interface TinySnapshot {
  url: string;
  title: string;
  root: TinyNode;
  capturedAt: number;
}

export type TinyScrollOptions =
  | { x?: number; y?: number; behavior?: ScrollBehavior }
  | { nodeId: number; block?: ScrollLogicalPosition; inline?: ScrollLogicalPosition };

export type TinyCommand =
  | { id: string; type: "snapshot" }
  | { id: string; type: "click"; nodeId: number }
  | { id: string; type: "type"; nodeId: number; text: string }
  | { id: string; type: "press"; key: string }
  | { id: string; type: "select"; nodeId: number; value: string }
  | { id: string; type: "scroll"; options: TinyScrollOptions }
  | { id: string; type: "getUrl" }
  | { id: string; type: "getTitle" };

export type TinyCommandInput = TinyCommand extends infer Command
  ? Command extends { id: string }
    ? Omit<Command, "id">
    : never
  : never;

export type TinyRuntimeMessage =
  | { type: "tinybrowser:ready" }
  | { type: "tinybrowser:navigate"; url: string }
  | { type: "tinybrowser:response"; id: string; value: unknown }
  | { type: "tinybrowser:error"; id: string; message: string }
  | { type: "tinybrowser:tree-changed" };

export interface TinyPage {
  goto(url: string): Promise<void>;
  snapshot(): Promise<TinySnapshot>;
  click(nodeId: number): Promise<void>;
  type(nodeId: number, text: string): Promise<void>;
  press(key: string): Promise<void>;
  scroll(options: TinyScrollOptions): Promise<void>;
  select(nodeId: number, value: string): Promise<void>;
  url(): Promise<string>;
  title(): Promise<string>;
}
