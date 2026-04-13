/**
 * 在 macOS 打包完成后，向 *-mac.zip 内追加「首次打开-解除隔离.command」
 *（内容与 dmg-assets 中文件一致，便于 zip / dmg 同源）。
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.join(__dirname, "..", "release");
const commandSrc = path.join(__dirname, "..", "dmg-assets", "首次打开-解除隔离.command");

const COMMAND_NAME = "首次打开-解除隔离.command";

function isMacAppZip(name) {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".zip")) return false;
  if (lower.includes("win") || lower.includes("linux")) return false;
  return lower.includes("mac") || lower.includes("darwin") || /arm64|x64|universal/.test(lower);
}

function patchZip(zipPath) {
  if (!fs.existsSync(commandSrc)) {
    console.warn("[patch-mac-artifacts] 缺少源文件:", commandSrc);
    return;
  }
  const scriptBody = fs.readFileSync(commandSrc, "utf8");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sa-mac-patch-"));
  try {
    execFileSync("/usr/bin/unzip", ["-q", zipPath, "-d", tmp], { stdio: "inherit" });
    const scriptPath = path.join(tmp, COMMAND_NAME);
    fs.writeFileSync(scriptPath, scriptBody, "utf8");
    try {
      fs.chmodSync(scriptPath, 0o755);
    } catch {
      /* ignore */
    }
    const backup = zipPath + ".before-patch";
    fs.renameSync(zipPath, backup);
    try {
      execFileSync("/usr/bin/zip", ["-q", "-r", "-y", zipPath, "."], {
        cwd: tmp,
        stdio: "inherit",
      });
    } catch (e) {
      fs.renameSync(backup, zipPath);
      throw e;
    }
    fs.unlinkSync(backup);
    console.log("[patch-mac-artifacts] 已写入", COMMAND_NAME, "→", path.basename(zipPath));
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  if (process.platform !== "darwin") {
    console.log("[patch-mac-artifacts] 非 macOS 构建，跳过。");
    return;
  }
  if (!fs.existsSync(releaseDir)) {
    console.warn("[patch-mac-artifacts] 无 release 目录，跳过。");
    return;
  }
  const names = fs.readdirSync(releaseDir).filter(isMacAppZip);
  if (names.length === 0) {
    console.log("[patch-mac-artifacts] 未找到 mac .zip，跳过。");
    return;
  }
  for (const name of names) {
    patchZip(path.join(releaseDir, name));
  }
}

main();
