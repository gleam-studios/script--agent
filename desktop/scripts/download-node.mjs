/**
 * 下载当前平台对应的 Node 官方二进制到 desktop/resources/node-bin/
 * （与 electron-builder 单次构建的平台一致）
 */
import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { createWriteStream } from "fs";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(__dirname, "..");
const NODE_VERSION = process.env.NODE_DESKTOP_VERSION || "20.18.1";
const outDir = path.join(desktopDir, "resources", "node-bin");

function platformKey() {
  const p = process.platform;
  const a = process.arch;
  if (p === "win32" && a === "x64")
    return {
      archiveName: `node-v${NODE_VERSION}-win-x64.zip`,
      folder: `node-v${NODE_VERSION}-win-x64`,
      file: "node.exe",
      ext: "zip",
    };
  if (p === "darwin" && a === "arm64")
    return {
      archiveName: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
      folder: `node-v${NODE_VERSION}-darwin-arm64`,
      file: "bin/node",
      ext: "tar.gz",
    };
  if (p === "darwin" && a === "x64")
    return {
      archiveName: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
      folder: `node-v${NODE_VERSION}-darwin-x64`,
      file: "bin/node",
      ext: "tar.gz",
    };
  console.error("不支持的构建平台:", p, a);
  process.exit(1);
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const f = createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode === 302 || res.statusCode === 301) {
          const loc = res.headers.location;
          if (!loc) return reject(new Error("redirect without location"));
          res.resume();
          return resolve(download(loc, dest));
        }
        if (res.statusCode !== 200) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} ${url}`));
        }
        res.pipe(f);
        f.on("finish", () => f.close(resolve));
      })
      .on("error", reject);
  });
}

const key = platformKey();
const base = `https://nodejs.org/dist/v${NODE_VERSION}/`;
const url = base + key.archiveName;
const cacheDir = path.join(desktopDir, ".cache");
const archivePath = path.join(cacheDir, key.archiveName);

fs.mkdirSync(cacheDir, { recursive: true });
if (!fs.existsSync(archivePath)) {
  console.log("[download-node] 下载", url);
  await download(url, archivePath);
} else {
  console.log("[download-node] 使用缓存", archivePath);
}

const extractDir = path.join(cacheDir, `extract-${NODE_VERSION}-${process.platform}-${process.arch}`);
fs.rmSync(extractDir, { recursive: true, force: true });
fs.mkdirSync(extractDir, { recursive: true });

if (key.ext === "zip") {
  if (process.platform === "win32") {
    execFileSync(
      "powershell.exe",
      ["-NoProfile", "-Command", `Expand-Archive -Path '${archivePath}' -DestinationPath '${extractDir}'`],
      { stdio: "inherit" }
    );
  } else {
    execFileSync("unzip", ["-q", archivePath, "-d", extractDir], { stdio: "inherit" });
  }
} else {
  execFileSync("tar", ["-xzf", archivePath, "-C", extractDir], { stdio: "inherit" });
}

const srcNode = path.join(extractDir, key.folder, key.file);
if (!fs.existsSync(srcNode)) {
  console.error("未找到 Node 二进制:", srcNode);
  process.exit(1);
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const destName = process.platform === "win32" ? "node.exe" : "node";
const destPath = path.join(outDir, destName);
fs.copyFileSync(srcNode, destPath);
if (process.platform !== "win32") {
  try {
    fs.chmodSync(destPath, 0o755);
  } catch {}
}

console.log("[download-node] 完成 →", destPath);
