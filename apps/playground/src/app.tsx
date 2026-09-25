import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight,
  Braces,
  ExternalLink,
  Globe2,
  MousePointer2,
  RotateCw,
  Terminal,
  Type,
} from "lucide-react";
import {
  TinyBrowser,
  IframeBrowserAdapter,
  type TinyPage,
  type TinyNode,
  type TinySnapshot,
} from "@tinyaifoundation/tiny-browser";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import "./style.css";

const relayBasePath =
  (window as Window & { __tinybrowserRelayBasePath?: string })
    .__tinybrowserRelayBasePath ?? "";
const demoUrl = "https://demo.tinybrowser/";

function TreeNode({
  node,
  depth,
  selected,
  onSelect,
}: {
  node: TinyNode;
  depth: number;
  selected?: number;
  onSelect(node: TinyNode): void;
}) {
  const flags = [
    node.editable && "editable",
    node.clickable && "clickable",
    node.disabled && "disabled",
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <>
      <button
        type="button"
        className={`tree-line ${selected === node.id ? "selected" : ""}`}
        style={{ paddingLeft: `${depth * 15 + 8}px` }}
        onClick={() => onSelect(node)}
      >
        <span className="tree-role">{node.role}</span>{" "}
        <span>{node.name ? `“${node.name.slice(0, 100)}”` : ""}</span>{" "}
        <span className="tree-id">#{node.id}</span>{" "}
        <span className="tree-flags">{flags}</span>
      </button>
      {node.children?.map((child) => (
        <TreeNode
          key={child.id}
          node={child}
          depth={depth + 1}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function App() {
  const frameHost = useRef<HTMLDivElement>(null);
  const page = useRef<TinyPage | undefined>(undefined);
  const changeTimer = useRef<number | undefined>(undefined);
  const [address, setAddress] = useState(demoUrl);
  const [status, setStatus] = useState("Starting Tiny Browser…");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [snapshot, setSnapshot] = useState<TinySnapshot | undefined>();
  const [selected, setSelected] = useState<TinyNode | undefined>();
  const [nodeId, setNodeId] = useState("");
  const [text, setText] = useState("");
  const [key, setKey] = useState("Enter");

  const report = (value: unknown) => {
    setError(true);
    setLoading(false);
    setStatus(value instanceof Error ? value.message : String(value));
  };
  async function refresh(current = page.current) {
    if (!current) return;
    const next = await current.snapshot();
    setSnapshot(next);
    setStatus(`${next.title || next.url} · snapshot ready`);
    setError(false);
  }
  async function navigate(value: string) {
    const normalized = new URL(value).href;
    if (!["http:", "https:"].includes(new URL(normalized).protocol))
      throw new Error("Use an HTTP or HTTPS URL.");
    setLoading(true);
    setError(false);
    setStatus(`Opening ${normalized}…`);
    setSnapshot(undefined);
    setSelected(undefined);
    window.clearTimeout(changeTimer.current);
    page.current?.dispose();
    page.current = undefined;
    const browser = new TinyBrowser(
      new IframeBrowserAdapter({ basePath: relayBasePath }),
    );
    await browser.start();
    const next = await browser.newPage();
    page.current = next;
    next.onNavigation((url) => {
      setAddress(url);
      void refresh(next).catch(report);
    });
    next.onTreeChanged(() => {
      window.clearTimeout(changeTimer.current);
      changeTimer.current = window.setTimeout(
        () => void refresh(next).catch(report),
        200,
      );
    });
    frameHost.current?.replaceChildren(next.element);
    await next.goto(normalized);
    if (page.current !== next) return;
    setAddress(normalized);
    await refresh(next);
    setLoading(false);
  }
  async function action(task: (current: TinyPage) => Promise<void>) {
    if (!page.current) throw new Error("Open a page first.");
    await task(page.current);
    await refresh(page.current);
  }
  useEffect(() => {
    void navigate(demoUrl).catch(report);
    return () => {
      window.clearTimeout(changeTimer.current);
      page.current?.dispose();
    };
  }, []);

  const selectedId = Number(nodeId);
  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Globe2 size={21} strokeWidth={2.5} />
          </span>
          <div>
            <strong>Tiny Browser</strong>
            <small>Agent browser lab</small>
          </div>
        </div>
        <a
          className="header-link"
          href="https://github.com/tinyaifoundation/tiny-browser"
          target="_blank"
          rel="noreferrer"
        >
          GitHub <ExternalLink size={14} />
        </a>
      </header>
      <section className="intro">
        <div>
          <p className="eyebrow">WEB EMBEDDED · AGENT READY</p>
          <h1>
            A browser you can see.
            <br />A page your agent can understand.
          </h1>
          <p>
            Navigate a live page, inspect its semantic tree, and run precise
            actions by node ID. Your browser renders and acts; a small relay
            fetches the page.
          </p>
        </div>
        <div className="intro-stat">
          <span>01 / 03</span>
          <strong>Start with the demo</strong>
          <small>Click a tree node to fill the action target.</small>
        </div>
      </section>
      <Card className="browser-shell">
        <CardHeader className="browser-header">
          <form
            className="addressbar"
            onSubmit={(event) => {
              event.preventDefault();
              void navigate(address).catch(report);
            }}
          >
            <Globe2 className="address-icon" size={18} />
            <label className="sr-only" htmlFor="url">
              Website URL
            </label>
            <Input
              id="url"
              type="url"
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              spellCheck={false}
              autoComplete="off"
              placeholder="https://example.com"
            />
            <Button className="accent-button" type="submit" disabled={loading}>
              Open page <ArrowRight size={15} />
            </Button>
            <Button
              variant="outline"
              type="button"
              onClick={() => void navigate(demoUrl).catch(report)}
            >
              Reset demo
            </Button>
          </form>
          <div className={`statusbar ${error ? "status-error" : ""}`}>
            <span className="status-dot" />
            <output aria-live="polite">{status}</output>
            <span className="status-tip">
              First-party gateway · Sandboxed frame
            </span>
          </div>
        </CardHeader>
        <CardContent className="workspace">
          <section className="pane site-pane" aria-labelledby="site-heading">
            <div className="pane-heading">
              <div>
                <span className="pane-kicker">RENDERED PAGE</span>
                <h2 id="site-heading">Website</h2>
              </div>
              <Badge variant="outline">Sandboxed iframe</Badge>
            </div>
            <div ref={frameHost} className="browser-view" />
          </section>
          <section className="pane tree-pane" aria-labelledby="tree-heading">
            <div className="pane-heading">
              <div>
                <span className="pane-kicker">AGENT VIEW</span>
                <h2 id="tree-heading">Semantic tree</h2>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refresh().catch(report)}
              >
                <RotateCw size={14} /> Refresh
              </Button>
            </div>
            <div className="tree" tabIndex={0}>
              {snapshot ? (
                <>
                  <div className="tree-meta">
                    <strong>{snapshot.title || "Untitled"}</strong>
                    <br />
                    {snapshot.url}
                  </div>
                  <TreeNode
                    node={snapshot.root}
                    depth={0}
                    selected={selected?.id}
                    onSelect={(node) => {
                      setSelected(node);
                      setNodeId(String(node.id));
                    }}
                  />
                </>
              ) : (
                <div className="tree-empty">
                  Waiting for the page and agent runtime…
                </div>
              )}
            </div>
          </section>
        </CardContent>
      </Card>
      <section className="actions" aria-labelledby="actions-heading">
        <div className="actions-title">
          <span className="pane-kicker">DETERMINISTIC ACTIONS</span>
          <h2 id="actions-heading">Interact by node ID</h2>
          <p>
            {selected
              ? `${selected.role}${selected.name ? ` · ${selected.name.slice(0, 60)}` : ""} · #${selected.id}`
              : "Select a node in the tree to target it."}
          </p>
        </div>
        <Tabs defaultValue="click" className="actions-tabs">
          <TabsList>
            <TabsTrigger value="click">
              <MousePointer2 size={14} /> Click
            </TabsTrigger>
            <TabsTrigger value="type">
              <Type size={14} /> Type
            </TabsTrigger>
            <TabsTrigger value="key">
              <Terminal size={14} /> Press key
            </TabsTrigger>
          </TabsList>
          <TabsContent value="click">
            <form
              className="action-row"
              onSubmit={(event) => {
                event.preventDefault();
                void action((current) => current.click(selectedId)).catch(
                  report,
                );
              }}
            >
              <label htmlFor="click-id">Node ID</label>
              <Input
                id="click-id"
                type="number"
                min="1"
                required
                value={nodeId}
                onChange={(event) => setNodeId(event.target.value)}
              />
              <Button className="accent-button" type="submit">
                Click node
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="type">
            <form
              className="action-row"
              onSubmit={(event) => {
                event.preventDefault();
                void action((current) => current.type(selectedId, text)).catch(
                  report,
                );
              }}
            >
              <label htmlFor="type-id">Node ID</label>
              <Input
                id="type-id"
                type="number"
                min="1"
                required
                value={nodeId}
                onChange={(event) => setNodeId(event.target.value)}
              />
              <label htmlFor="type-text">Text</label>
              <Input
                id="type-text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder="Type something"
                required
              />
              <Button className="accent-button" type="submit">
                Type
              </Button>
            </form>
          </TabsContent>
          <TabsContent value="key">
            <form
              className="action-row"
              onSubmit={(event) => {
                event.preventDefault();
                void action((current) => current.press(key)).catch(report);
              }}
            >
              <label htmlFor="press-key">Key</label>
              <Input
                id="press-key"
                value={key}
                onChange={(event) => setKey(event.target.value)}
                required
              />
              <Button className="accent-button" type="submit">
                Press key
              </Button>
            </form>
          </TabsContent>
        </Tabs>
      </section>
      <footer>
        Open source by Tiny AI Foundation <span>·</span> First-party gateway and
        runtime <span>·</span> Runs in your browser <Braces size={14} />
      </footer>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
