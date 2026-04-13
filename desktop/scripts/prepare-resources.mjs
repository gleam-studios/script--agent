/**
 * 1) 构建 web
 * 2) 将 standalone + .next/static + public 复制到 desktop/resources/next
 * 3) 将 agent / knowledge / skills 复制到 desktop/resources/app-root
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

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

console.log("[prepare-resources] 完成 →", destNext, appRoot);
