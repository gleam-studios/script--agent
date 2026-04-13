const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const net = require("net");
const http = require("http");

/** @type {import('child_process').ChildProcess | null} */
let nextProcess = null;

function repoRoot() {
  return path.join(__dirname, "..");
}

function getPaths() {
  if (app.isPackaged) {
    const nodeName = process.platform === "win32" ? "node.exe" : "node";
    return {
      nextDir: path.join(process.resourcesPath, "next"),
      scriptAgentRoot: path.join(process.resourcesPath, "app-root"),
      nodeBin: path.join(process.resourcesPath, "node-bin", nodeName),
    };
  }
  const root = repoRoot();
  return {
    nextDir: path.join(root, "web", ".next", "standalone", "web"),
    scriptAgentRoot: root,
    nodeBin: "node",
  };
}

function findFreePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const addr = s.address();
      const port = typeof addr === "object" && addr ? addr.port : 4000;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

function waitForHttpOk(urlStr, timeoutMs = 120000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    const u = new URL(urlStr);
    const tick = () => {
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: "/",
          method: "GET",
          timeout: 2500,
        },
        (res) => {
          res.resume();
          resolve();
        }
      );
      req.on("error", () => {
        if (Date.now() > deadline) reject(new Error("等待 Next 启动超时"));
        else setTimeout(tick, 400);
      });
      req.end();
    };
    tick();
  });
}

async function startNextServer() {
  const { nextDir, scriptAgentRoot, nodeBin } = getPaths();
  const serverJs = path.join(nextDir, "server.js");
  if (!fs.existsSync(serverJs)) {
    throw new Error(
      "未找到 Next standalone。请先执行：cd desktop && npm run stage（或先 cd web && npm run build）"
    );
  }
  if (app.isPackaged && !fs.existsSync(nodeBin)) {
    throw new Error("未找到打包的 Node 可执行文件: " + nodeBin);
  }

  const port = await findFreePort();
  const dataDir = path.join(app.getPath("userData"), "data", "projects");
  fs.mkdirSync(dataDir, { recursive: true });

  const env = {
    ...process.env,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    SCRIPT_AGENT_ROOT: scriptAgentRoot,
    SCRIPT_AGENT_DATA_DIR: dataDir,
  };

  nextProcess = spawn(nodeBin, ["server.js"], {
    cwd: nextDir,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  nextProcess.stdout?.on("data", (d) => process.stdout.write(d));
  nextProcess.stderr?.on("data", (d) => process.stderr.write(d));
  nextProcess.on("error", (e) => console.error("[next]", e));

  const url = `http://127.0.0.1:${port}`;
  await waitForHttpOk(url);
  return { port, url };
}

function killNext() {
  if (nextProcess) {
    try {
      nextProcess.kill();
    } catch {}
    nextProcess = null;
  }
}

async function createWindow() {
  const { url } = await startNextServer();
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });
  await win.loadURL(url);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const w = BrowserWindow.getAllWindows()[0];
    if (w) {
      if (w.isMinimized()) w.restore();
      w.focus();
    }
  });

  async function boot() {
    try {
      await createWindow();
    } catch (e) {
      console.error(e);
      const { dialog } = require("electron");
      dialog.showErrorBox("启动失败", String(e?.message ?? e));
      app.quit();
    }
  }

  app.whenReady().then(() => boot());

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) boot();
  });

  app.on("window-all-closed", () => {
    killNext();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    killNext();
  });
}
