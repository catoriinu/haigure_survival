import { defineConfig, type Plugin } from "vite";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ServerResponse } from "node:http";

const assetsRoot = path.resolve(__dirname, "assets");

const assetRouteMap: Record<string, string> = {
  "/audio": "audio",
  "/picture": "picture",
  "/stage": "stage",
  "/config": "config"
};

const contentTypeByExtension: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif"
};

const resolveExternalAssetPath = (requestPathname: string) => {
  const pathname = decodeURIComponent(requestPathname);
  for (const [routePrefix, directory] of Object.entries(assetRouteMap)) {
    if (pathname !== routePrefix && !pathname.startsWith(`${routePrefix}/`)) {
      continue;
    }
    const relativePath = pathname
      .slice(routePrefix.length)
      .replace(/^\/+/, "");
    const candidatePath = path.resolve(assetsRoot, directory, relativePath);
    const directoryRoot = path.resolve(assetsRoot, directory);
    if (
      candidatePath !== directoryRoot &&
      !candidatePath.startsWith(`${directoryRoot}${path.sep}`)
    ) {
      return null;
    }
    return candidatePath;
  }
  return null;
};

const createExternalAssetsPlugin = (): Plugin => {
  const serveExternalAsset = (
    url: string | undefined,
    res: ServerResponse,
    next: () => void
  ) => {
    if (!url) {
      next();
      return;
    }
    const requestPathname = url.split("?")[0].split("#")[0];
    const filePath = resolveExternalAssetPath(requestPathname);
    if (!filePath) {
      next();
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      res.statusCode = 404;
      res.end();
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    const contentType = contentTypeByExtension[extension];
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }
    fs.createReadStream(filePath).pipe(res);
  };

  return {
    name: "external-assets-dev-server",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        serveExternalAsset(req.url, res, next);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        serveExternalAsset(req.url, res, next);
      });
    }
  };
};

export default defineConfig({
  base: "./",
  publicDir: false,
  plugins: [createExternalAssetsPlugin()],
  server: {
    port: 5175,
    strictPort: true
  },
  build: {
    target: "es2022"
  }
});
