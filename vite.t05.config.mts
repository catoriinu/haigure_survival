import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T05"),
  publicDir: false,
  base: "./",
  optimizeDeps: {
    exclude: ["recast-navigation"]
  },
  server: {
    port: 5180,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t05-validation"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000
  }
});
