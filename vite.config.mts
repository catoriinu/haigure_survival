import { readdir, readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const toPosixPath = (value: string) => value.replace(/\\/g, "/");
const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = resolve(repositoryRoot, "public");
const productionPublicRoots = Object.freeze(["LICENSES", "stage-assets"]);
const forbiddenProductionModulePathMarkers = Object.freeze([
  "/public/audio/",
  "/public/picture/chara/"
]);

const listFiles = async (directory: string): Promise<readonly string[]> => {
  const entries = (await readdir(directory, { withFileTypes: true })).sort(
    (left, right) => {
      if (left.name < right.name) {
        return -1;
      }
      if (left.name > right.name) {
        return 1;
      }
      return 0;
    }
  );
  const files: string[] = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFiles(path)));
      continue;
    }
    if (entry.isFile()) {
      files.push(path);
      continue;
    }
    throw new Error(`production公開資産に通常ファイル以外が含まれています: ${path}`);
  }
  return files;
};

const allowlistedProductionPublicAssets = (): Plugin => ({
  name: "allowlisted-production-public-assets",
  apply: "build",
  async generateBundle(_outputOptions, bundle) {
    const forbiddenModules = Object.values(bundle)
      .filter((output) => output.type === "chunk")
      .flatMap((chunk) => Object.keys(chunk.modules))
      .map(toPosixPath)
      .filter((modulePath) =>
        forbiddenProductionModulePathMarkers.some((marker) =>
          modulePath.includes(marker)
        )
      )
      .sort();
    if (forbiddenModules.length > 0) {
      this.error(
        `production bundleへローカル音声・Character画像moduleが混入しています: ${forbiddenModules.join(", ")}`
      );
    }

    const emittedPaths = new Set<string>();
    for (const root of productionPublicRoots) {
      const sourceRoot = resolve(publicRoot, root);
      for (const sourcePath of await listFiles(sourceRoot)) {
        const outputPath = toPosixPath(relative(publicRoot, sourcePath));
        if (emittedPaths.has(outputPath)) {
          this.error(`production公開資産pathが重複しています: ${outputPath}`);
        }
        emittedPaths.add(outputPath);
        this.emitFile({
          type: "asset",
          fileName: outputPath,
          source: await readFile(sourcePath)
        });
      }
    }
  }
});

export default defineConfig(({ command }) => ({
  base: "./",
  publicDir: command === "serve" ? publicRoot : false,
  plugins: [allowlistedProductionPublicAssets()],
  server: {
    port: 5175,
    strictPort: true
  },
  build: {
    target: "es2022",
    copyPublicDir: false,
    chunkSizeWarningLimit: 4000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = toPosixPath(id);
          if (normalizedId.includes("/node_modules/@babylonjs/")) {
            return "babylon";
          }
          if (normalizedId.includes("/node_modules/recast-navigation/")) {
            return "recast";
          }
          if (normalizedId.includes("/src/world/")) {
            return "world-v2";
          }
          return undefined;
        }
      }
    }
  }
}));
