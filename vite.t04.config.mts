import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const repositoryRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: resolve(repositoryRoot, "validation/v2/T04"),
  publicDir: resolve(repositoryRoot, "public/stage-assets/v2/B02"),
  base: "./",
  cacheDir: resolve(repositoryRoot, "node_modules/.vite-t04"),
  optimizeDeps: {
    exclude: ["recast-navigation"]
  },
  server: {
    port: 5179,
    strictPort: true
  },
  build: {
    target: "es2022",
    outDir: resolve(repositoryRoot, "dist/t04-validation"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      input: {
        main: resolve(repositoryRoot, "validation/v2/T04/index.html"),
        schoolIntegration: resolve(
          repositoryRoot,
          "validation/v2/T04/school-integration.html"
        )
      }
    }
  }
});
