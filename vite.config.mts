import { isAbsolute, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const toPosixPath = (value: string) => value.replace(/\\/g, "/");
const publicRoot = fileURLToPath(new URL("./public/", import.meta.url));

// publicはそのままコピーするため、カタログ用URLを別のassetとして再出力しない。
const publicAssetUrls = (): Plugin => ({
  name: "public-asset-urls",
  enforce: "pre",
  load(id) {
    if (!id.endsWith("?url")) {
      return null;
    }
    const publicPath = relative(publicRoot, id.slice(0, -4));
    if (isAbsolute(publicPath) || publicPath.startsWith("..")) {
      return null;
    }
    return `export default ${JSON.stringify(`./${toPosixPath(publicPath)}`)};`;
  },
});

export default defineConfig({
  base: "./",
  publicDir: "public",
  plugins: [publicAssetUrls()],
  server: {
    port: 5175,
    strictPort: true
  },
  build: {
    target: "es2022",
    copyPublicDir: true,
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
