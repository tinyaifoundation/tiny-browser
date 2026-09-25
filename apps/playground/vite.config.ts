import { defineConfig } from "vite";
import { build as bundle } from "esbuild";
import { dirname, join } from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const playgroundRoot = dirname(new URL(import.meta.url).pathname);
const runtimeEntry = join(playgroundRoot, "src/runtime-entry.ts");

async function bundleRuntime(): Promise<string> {
  const result = await bundle({
    entryPoints: [runtimeEntry],
    bundle: true,
    format: "iife",
    platform: "browser",
    target: "es2022",
    write: false,
  });
  return result.outputFiles[0]?.text ?? "";
}

export default defineConfig({
  resolve: { alias: { "@": join(playgroundRoot, "src") } },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/browse": "http://127.0.0.1:8080",
      "/health": "http://127.0.0.1:8080",
    },
  },
  build: { target: "es2022" },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "tinybrowser-runtime",
      configureServer(server) {
        server.middlewares.use(async (request, response, next) => {
          if (request.url?.split("?")[0] !== "/tinybrowser-runtime.js")
            return next();
          response.setHeader("content-type", "text/javascript; charset=utf-8");
          response.end(await bundleRuntime());
        });
      },
      async generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "tinybrowser-runtime.js",
          source: await bundleRuntime(),
        });
      },
    },
  ],
});
