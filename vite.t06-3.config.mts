import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

import { SCHOOL_STAGE } from "./src/world/stageCatalog";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const allowedAssets = new Map<string, string>([
  [
    `/${SCHOOL_STAGE.glbUrl}`,
    resolve(repositoryRoot, "public", SCHOOL_STAGE.glbUrl)
  ],
  [
    `/${SCHOOL_STAGE.navmeshUrl}`,
    resolve(repositoryRoot, "public", SCHOOL_STAGE.navmeshUrl)
  ],
  [
    `/${SCHOOL_STAGE.bitNavmeshUrl}`,
    resolve(repositoryRoot, "public", SCHOOL_STAGE.bitNavmeshUrl)
  ]
]);
if (SCHOOL_STAGE.roomVariantNavmesh.mode === "required") {
  allowedAssets.set(
    `/${SCHOOL_STAGE.roomVariantNavmesh.url}`,
    resolve(repositoryRoot, "public", SCHOOL_STAGE.roomVariantNavmesh.url)
  );
}

const contentTypeForPath = (path: string) =>
  path.endsWith(".glb")
    ? "model/gltf-binary"
    : "application/octet-stream";

const allowlistedStageAssets = (): Plugin => ({
  name: "t06-3-allowlisted-stage-assets",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(
        request.url ?? "/",
        "http://127.0.0.1"
      ).pathname;
      const sourcePath = allowedAssets.get(pathname);
      if (!sourcePath) {
        next();
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", contentTypeForPath(pathname));
      response.end(await readFile(sourcePath));
    });
  },
  async generateBundle() {
    for (const [urlPath, sourcePath] of allowedAssets) {
      this.emitFile({
        type: "asset",
        fileName: urlPath.slice(1),
        source: await readFile(sourcePath)
      });
    }
  }
});

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T06-3"),
  publicDir: false,
  base: "./",
  cacheDir: resolve(repositoryRoot, "node_modules/.vite-t06-3"),
  plugins: [allowlistedStageAssets()],
  optimizeDeps: {
    exclude: ["recast-navigation"]
  },
  server: {
    port: 5184,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t06-3-validation"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000
  }
});
