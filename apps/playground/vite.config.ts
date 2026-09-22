import { defineConfig } from "vite";
import { build as bundle } from "esbuild";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createReadStream, readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const playgroundRoot = dirname(new URL(import.meta.url).pathname);
const scramjetRoot = join(dirname(require.resolve("@mercuryworkshop/scramjet")), "..");
const controllerRoot = join(dirname(require.resolve("@mercuryworkshop/scramjet-controller")), "..");
const runtimeEntry = join(playgroundRoot, "src/runtime-entry.ts");
const assets = {
  scramjet: { fileName: "scramjet/scramjet.js", source: join(scramjetRoot, "dist/scramjet.js"), type: "text/javascript" },
  wasm: { fileName: "scramjet/scramjet.wasm", source: join(scramjetRoot, "dist/scramjet.wasm"), type: "application/wasm" },
  controllerApi: { fileName: "controller/controller.api.js", source: join(controllerRoot, "dist/controller.api.js"), type: "text/javascript" },
  controllerInject: { fileName: "controller/controller.inject.js", source: join(controllerRoot, "dist/controller.inject.js"), type: "text/javascript" },
  controllerSw: { fileName: "controller/controller.sw.js", source: join(controllerRoot, "dist/controller.sw.js"), type: "text/javascript" },
} as const;

async function bundleRuntime(): Promise<string> {
  const result = await bundle({
    entryPoints: [runtimeEntry],
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  return result.outputFiles[0]?.text ?? "";
}

const staticDependencyAssets = {
  name: "tinybrowser-static-dependencies",
  configureServer(server: { middlewares: { use(handler: (request: { url?: string }, response: { setHeader(name: string, value: string): void; end(body?: string): void }, next: () => void) => void): void } }) {
    server.middlewares.use(async (request, response, next) => {
      if (request.url?.split("?")[0] === "/tinybrowser-runtime.js") {
        response.setHeader("content-type", "text/javascript");
        response.end(await bundleRuntime());
        return;
      }
      const asset = Object.values(assets).find((candidate) => `/${candidate.fileName}` === request.url?.split("?")[0]);
      if (!asset) return next();
      response.setHeader("content-type", asset.type);
      createReadStream(asset.source).pipe(response as never);
    });
  },
  async generateBundle(this: { emitFile(file: { type: "asset"; fileName: string; source: Buffer | string }): void }) {
    for (const asset of Object.values(assets)) {
      this.emitFile({ type: "asset", fileName: asset.fileName, source: readFileSync(asset.source) });
    }
    this.emitFile({ type: "asset", fileName: "tinybrowser-runtime.js", source: await bundleRuntime() });
  },
};

export default defineConfig({
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
  build: { target: "es2022" },
  plugins: [staticDependencyAssets],
});
