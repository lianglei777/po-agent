import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildServerEnvironment,
  ensureDirectory,
  getPackagedServerRoot,
  getPiAgentDir,
  getServerUrl,
  getStandaloneServerPath,
} from "./desktop-runtime.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appIconPath = path.resolve(__dirname, "..", "build", "icon.png");
const preloadPath = path.join(__dirname, "preload.cjs");

let serverProcess;

function getAppRoot() {
  if (app.isPackaged) return getPackagedServerRoot(process.resourcesPath);
  return path.resolve(__dirname, "..");
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => {
        if (!address || typeof address === "string") {
          reject(new Error("Unable to allocate a local port."));
          return;
        }
        resolve(address.port);
      });
    });
  });
}

function waitForServer(url, deadlineMs = 30000) {
  const startedAt = Date.now();

  return new Promise((resolve, reject) => {
    async function poll() {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (response.ok) {
          resolve();
          return;
        }
      } catch {
        // 服务器启动期间请求失败是预期行为，继续轮询直到超时。
      }

      if (Date.now() - startedAt > deadlineMs) {
        reject(new Error("Timed out waiting for the local server to start."));
        return;
      }

      setTimeout(poll, 250);
    }

    void poll();
  });
}

function startServer({
  appRoot,
  builtinSkillsDir,
  pipelineSkillsDir,
  officialPacksDir,
  port,
  piAgentDir,
}) {
  const serverPath = getStandaloneServerPath(appRoot);
  ensureDirectory(piAgentDir);

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: appRoot,
    env: buildServerEnvironment({
      builtinSkillsDir,
      pipelineSkillsDir,
      officialPacksDir,
      piAgentDir,
      port,
    }),
    stdio: "ignore",
    windowsHide: true,
  });

  serverProcess.once("exit", () => {
    serverProcess = undefined;
  });
}

async function createWindow() {
  const appRoot = getAppRoot();
  const builtinSkillsDir = app.isPackaged
    ? path.join(process.resourcesPath, "resources", "builtin-skills")
    : path.join(appRoot, "resources", "builtin-skills");
  const officialPacksDir = app.isPackaged
    ? path.join(process.resourcesPath, "resources", "official-packs")
    : path.join(appRoot, "resources", "official-packs");
  const pipelineSkillsDir = app.isPackaged
    ? path.join(process.resourcesPath, "resources", "pipeline-skills")
    : path.join(appRoot, "resources", "pipeline-skills");
  const piAgentDir = getPiAgentDir(app.getPath("userData"));
  const port = await findFreePort();
  const url = getServerUrl(port);

  startServer({
    appRoot,
    builtinSkillsDir,
    pipelineSkillsDir,
    officialPacksDir,
    port,
    piAgentDir,
  });
  await waitForServer(url);

  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 720,
    title: "Po Agent",
    icon: appIconPath,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
      sandbox: true,
    },
  });

  await window.loadURL(url);
}

function stopServer() {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill();
  serverProcess = undefined;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  ipcMain.handle("project:select-directory", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    return result.canceled ? null : result.filePaths[0];
  });
  return createWindow();
}).catch((error) => {
  dialog.showErrorBox("Po Agent failed to start", error.message);
  app.quit();
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", stopServer);
