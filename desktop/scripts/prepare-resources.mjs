/**
 * 1) 构建 web
 * 2) 将 standalone + .next/static + public 复制到 desktop/resources/next
 * 3) 将 agent / knowledge / skills 复制到 desktop/resources/app-root
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const skipWattpad = process.env.SKIP_WATTPAD_DESKTOP === "1";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const desktopDir = path.join(__dirname, "..");
const repoRoot = path.join(desktopDir, "..");
const webDir = path.join(repoRoot, "web");

function runNpmBuild(cwd) {
  const r = spawnSync("npm", ["run", "build"], { cwd, stdio: "inherit", shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

console.log("[prepare-resources] npm run build (web) …");
runNpmBuild(webDir);

const standaloneSrc = path.join(webDir, ".next", "standalone", "web");
const destNext = path.join(desktopDir, "resources", "next");

if (!fs.existsSync(path.join(standaloneSrc, "server.js"))) {
  console.error("缺少", path.join(standaloneSrc, "server.js"));
  process.exit(1);
}

fs.rmSync(destNext, { recursive: true, force: true });
fs.cpSync(standaloneSrc, destNext, { recursive: true });

const staticSrc = path.join(webDir, ".next", "static");
const staticDest = path.join(destNext, ".next", "static");
fs.rmSync(staticDest, { recursive: true, force: true });
fs.cpSync(staticSrc, staticDest, { recursive: true });

const publicSrc = path.join(webDir, "public");
const publicDest = path.join(destNext, "public");
fs.rmSync(publicDest, { recursive: true, force: true });
fs.cpSync(publicSrc, publicDest, { recursive: true });

const appRoot = path.join(desktopDir, "resources", "app-root");
fs.rmSync(appRoot, { recursive: true, force: true });
fs.mkdirSync(appRoot, { recursive: true });

for (const name of ["agent", "knowledge", "skills"]) {
  fs.cpSync(path.join(repoRoot, name), path.join(appRoot, name), { recursive: true });
}

if (!skipWattpad) {
  console.log("[prepare-resources] Wattpad API（PyInstaller，当前系统）…");
  const py = process.platform === "win32" ? "python" : "python3";
  const bundleScript = path.join(repoRoot, "services", "wattpad-api", "build_desktop_bundle.py");
  const br = spawnSync(py, [bundleScript], { cwd: repoRoot, stdio: "inherit", shell: process.platform === "win32" });
  if (br.status !== 0) {
    console.error("[prepare-resources] Wattpad 打包失败。可设置 SKIP_WATTPAD_DESKTOP=1 跳过（扒网文将不可用）。");
    process.exit(br.status ?? 1);
  }
} else {
  console.warn("[prepare-resources] 已跳过 Wattpad 打包（SKIP_WATTPAD_DESKTOP=1），扒网文不可用");
  const stub = path.join(desktopDir, "resources", "wattpad-api-bin");
  fs.mkdirSync(stub, { recursive: true });
  fs.writeFileSync(path.join(stub, "SKIPPED.txt"), "SKIP_WATTPAD_DESKTOP=1\n");
}

console.log("[prepare-resources] 完成 →", destNext, appRoot);
