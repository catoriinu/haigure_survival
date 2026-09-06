import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T05"),
  publicDir: false,
  base: "./",
  cacheDir: resolve(repositoryRoot, "node_modules/.vite-t05"),
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
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: {
        index: resolve(
          repositoryRoot,
          "validation/v2/T05/index.html"
        ),
        npcCommand: resolve(
          repositoryRoot,
          "validation/v2/T05/npc-command.html"
        )
      }
    }
  }
});
