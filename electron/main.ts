import { app, BrowserWindow, net, protocol } from "electron";
import * as path from "path";
import * as fs from "node:fs";
import { pathToFileURL } from "node:url";

protocol.registerSchemesAsPrivileged([
  {
    scheme: "app",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true
    }
  }
]);

const devServerUrl = process.env.VITE_DEV_SERVER_URL;

const resolveWithinRoot = (root: string, relativePath: string) => {
  const absoluteRoot = path.resolve(root);
  const absolutePath = path.resolve(absoluteRoot, relativePath);
  if (
    absolutePath === absoluteRoot ||
    absolutePath.startsWith(`${absoluteRoot}${path.sep}`)
  ) {
    return absolutePath;
  }
  return null;
};

const registerAppProtocol = () => {
  const distRoot = path.resolve(__dirname, "..", "dist");
  const assetRoot = path.resolve(path.dirname(app.getPath("exe")), "assets");
  const bgmRoot = path.resolve(assetRoot, "audio", "bgm");
  const assetRouteRoots: Record<string, string> = {
    "/audio": path.resolve(assetRoot, "audio"),
    "/picture": path.resolve(assetRoot, "picture"),
    "/stage": path.resolve(assetRoot, "stage"),
    "/config": path.resolve(assetRoot, "config")
  };
  const getBgmFileNames = () => {
    if (!fs.existsSync(bgmRoot) || !fs.statSync(bgmRoot).isDirectory()) {
      return [] as string[];
    }
    return fs
      .readdirSync(bgmRoot, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => path.extname(name).toLowerCase() === ".mp3")
      .sort((a, b) => a.localeCompare(b));
  };

  protocol.handle("app", (request) => {
    const requestUrl = new URL(request.url);
    const pathname = decodeURIComponent(requestUrl.pathname);
    if (pathname === "/config/bgm-files.json") {
      const body = JSON.stringify(getBgmFileNames());
      return new Response(body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8"
        }
      });
    }
    if (pathname === "/" || pathname === "/index.html") {
      const indexPath = path.resolve(distRoot, "index.html");
      if (!fs.existsSync(indexPath)) {
        return new Response("Not Found", { status: 404 });
      }
      return net.fetch(pathToFileURL(indexPath).toString());
    }

    for (const [routePrefix, routeRoot] of Object.entries(assetRouteRoots)) {
      if (pathname !== routePrefix && !pathname.startsWith(`${routePrefix}/`)) {
        continue;
      }
      const relativePath = pathname.slice(routePrefix.length).replace(/^\/+/, "");
      const filePath = resolveWithinRoot(routeRoot, relativePath);
      if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return new Response("Not Found", { status: 404 });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    }

    const distRelativePath = pathname.replace(/^\/+/, "");
    const distPath = resolveWithinRoot(distRoot, distRelativePath);
    if (!distPath || !fs.existsSync(distPath) || fs.statSync(distPath).isDirectory()) {
      return new Response("Not Found", { status: 404 });
    }
    return net.fetch(pathToFileURL(distPath).toString());
  });
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadURL("app://-/index.html");
  }
};

app.whenReady().then(() => {
  if (!devServerUrl) {
    registerAppProtocol();
  }
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
