import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T06-6B"),
  publicDir: false,
  base: "./",
  cacheDir: resolve(repositoryRoot, "node_modules/.vite-t06-6b"),
  server: { port: 5189, strictPort: true },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t06-6b-validation"),
    emptyOutDir: true
  }
});
