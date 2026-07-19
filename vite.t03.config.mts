import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const assetUrlPath = "/t01_glb_collision_course.glb";
const assetSourcePath = resolve(
  repositoryRoot,
  "public/stage-assets/v2/T01/t01_glb_collision_course.glb"
);

const allowlistedStageAssets = (): Plugin => ({
  name: "t03-allowlisted-stage-assets",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname !== assetUrlPath) {
        next();
        return;
      }
      response.statusCode = 200;
      response.setHeader("Content-Type", "model/gltf-binary");
      response.end(await readFile(assetSourcePath));
    });
  },
  async generateBundle() {
    this.emitFile({
      type: "asset",
      fileName: assetUrlPath.slice(1),
      source: await readFile(assetSourcePath)
    });
  }
});

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T03"),
  publicDir: false,
  base: "./",
  plugins: [allowlistedStageAssets()],
  server: {
    port: 5178,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t03-validation"),
    emptyOutDir: true
  }
});
