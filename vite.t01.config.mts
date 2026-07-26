import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T01"),
  publicDir: resolve(repositoryRoot, "public/stage-assets/v2/T01"),
  base: "./",
  cacheDir: resolve(repositoryRoot, "node_modules/.vite-t01"),
  server: {
    port: 5176,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t01-validation"),
    emptyOutDir: true
  }
});
