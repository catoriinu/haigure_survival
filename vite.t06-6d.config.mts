import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T06-6D"),
  publicDir: resolve(repositoryRoot, "public"),
  base: "./",
  cacheDir: resolve(repositoryRoot, "node_modules/.vite-t06-6d"),
  server: { port: 5193, strictPort: true },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t06-6d-validation"),
    emptyOutDir: true
  }
});
