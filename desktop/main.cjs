const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const net = require("net");
const http = require("http");

/** @type {import('child_process').ChildProcess | null} */
let nextProcess = null;
/** @type {import('child_process').ChildProcess | null} */
let wattpadProcess = null;

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
      wattpadBinDir: path.join(process.resourcesPath, "wattpad-api-bin"),
    };
  }
  const root = repoRoot();
  return {
    nextDir: path.join(root, "web", ".next", "standalone", "web"),
    scriptAgentRoot: root,
    nodeBin: "node",
    wattpadBinDir: path.join(root, "services", "wattpad-api"),
  };
}

/** @returns {{ ok: true, cmd: string, args: string[], cwd: string } | { ok: false }} */
function resolveWattpadLaunch(wattpadBinDir) {
  const win = process.platform === "win32";
  const packagedExe = path.join(wattpadBinDir, win ? "wattpad-api.exe" : "wattpad-api");
  if (fs.existsSync(packagedExe)) {
    return { ok: true, cmd: packagedExe, args: [], cwd: wattpadBinDir };
  }
  const venvPy = win
    ? path.join(wattpadBinDir, ".venv", "Scripts", "python.exe")
    : path.join(wattpadBinDir, ".venv", "bin", "python");
  if (fs.existsSync(venvPy)) {
    return {
      ok: true,
      cmd: venvPy,
      args: ["-m", "uvicorn", "main:app", "--host", "127.0.0.1"],
      cwd: wattpadBinDir,
    };
  }
  const fallback = win ? "python" : "python3";
  return { ok: true, cmd: fallback, args: ["-m", "uvicorn", "main:app", "--host", "127.0.0.1"], cwd: wattpadBinDir };
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
    const reqPath = u.pathname && u.pathname !== "" ? u.pathname : "/";
    const tick = () => {
      const req = http.request(
        {
          hostname: u.hostname,
          port: u.port,
          path: reqPath,
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

async function startWattpadServer(port) {
  const { wattpadBinDir } = getPaths();
  const skipped = path.join(wattpadBinDir, "SKIPPED.txt");
  if (fs.existsSync(skipped)) {
    console.warn("[wattpad] 打包已跳过，扒网文不可用");
    return null;
  }
  const resolved = resolveWattpadLaunch(wattpadBinDir);
  if (!resolved.ok) return null;

  const args =
    resolved.args.length === 0
      ? [String(port)]
      : [...resolved.args, "--port", String(port)];

  wattpadProcess = spawn(resolved.cmd, args, {
    cwd: resolved.cwd,
    env: { ...process.env, PYTHONUNBUFFERED: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  wattpadProcess.stdout?.on("data", (d) => process.stdout.write(d));
  wattpadProcess.stderr?.on("data", (d) => process.stderr.write(d));
  wattpadProcess.on("error", (e) => console.error("[wattpad]", e));

  const base = `http://127.0.0.1:${port}`;
  await waitForHttpOk(`${base}/health`, 90000);
  return base;
}

function killWattpad() {
  if (wattpadProcess) {
    try {
      wattpadProcess.kill();
    } catch {}
    wattpadProcess = null;
  }
}

async function startNextServer(wattpadBaseUrl) {
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
  if (wattpadBaseUrl) {
    env.WATTPAD_API_URL = wattpadBaseUrl;
  }

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
  const wattpadPort = await findFreePort();
  let wattpadBase = null;
  try {
    wattpadBase = await startWattpadServer(wattpadPort);
  } catch (e) {
    console.error("[wattpad] 启动失败，扒网文将不可用：", e);
  }
  const { url } = await startNextServer(wattpadBase || undefined);
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
    killWattpad();
    if (process.platform !== "darwin") app.quit();
  });

  app.on("before-quit", () => {
    killNext();
    killWattpad();
  });
}
