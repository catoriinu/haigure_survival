import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T06"),
  publicDir: false,
  base: "./",
  cacheDir: resolve(repositoryRoot, "node_modules/.vite-t06"),
  server: {
    port: 5181,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t06-validation"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: resolve(repositoryRoot, "validation/v2/T06/index.html")
    }
  }
});
