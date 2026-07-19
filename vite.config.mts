import { defineConfig } from "vite";

const toPosixPath = (value: string) => value.replace(/\\/g, "/");

export default defineConfig({
  base: "./",
  server: {
    port: 5175,
    strictPort: true
  },
  build: {
    target: "es2022",
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
});
