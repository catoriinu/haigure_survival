import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const stageFilenames = [
  "laboratory.json",
  "city_center.json",
  "arena.json",
  "arena_trap_room.json",
  "arena_roulette.json",
  "arena_mirror_house.json",
  "labyrinth.json",
  "labyrinth_dynamic.json"
];
const allowedAssets = new Map<string, string>([
  ...stageFilenames.map(
    (filename) => [
      `/stage/${filename}`,
      resolve(repositoryRoot, "public/stage", filename)
    ] as const
  ),
  [
    "/fixtures/t01_glb_collision_course.json",
    resolve(
      repositoryRoot,
      "validation/v2/T02/t01_glb_collision_course.json"
    )
  ],
  [
    "/stage-assets/v2/T01/t01_glb_collision_course.glb",
    resolve(
      repositoryRoot,
      "public/stage-assets/v2/T01/t01_glb_collision_course.glb"
    )
  ]
]);

const contentTypeForPath = (path: string) =>
  path.endsWith(".json") ? "application/json; charset=utf-8" : "model/gltf-binary";

const allowlistedStageAssets = (): Plugin => ({
  name: "t02-allowlisted-stage-assets",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
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
  root: resolve(repositoryRoot, "validation/v2/T02"),
  publicDir: false,
  base: "./",
  plugins: [allowlistedStageAssets()],
  server: {
    port: 5177,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t02-validation"),
    emptyOutDir: true
  }
});
