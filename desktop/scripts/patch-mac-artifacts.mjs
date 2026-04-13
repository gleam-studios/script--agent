/**
 * 在 macOS 打包完成后，向 *-mac.zip 内追加可双击的「首次打开-解除隔离.command」。
 * 脚本会对解压目录执行 `xattr -cr .` 再打开 .app（解决隔离导致无法打开）。
 * Windows 构建不会产生此类 zip，脚本会直接退出。
 */
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const releaseDir = path.join(__dirname, "..", "release");

const COMMAND_NAME = "首次打开-解除隔离.command";

const SCRIPT = `#!/bin/bash
set -e
cd "$(dirname "$0")"
# 清除本文件夹内所有文件的隔离属性（含 .app 与本脚本），再启动应用
xattr -cr .
APP=""
for d in *.app; do
  if [ -d "$d" ]; then APP="$d"; break; fi
done
if [ -z "$APP" ]; then
  osascript -e 'display alert "未找到应用程序" message "请将 zip 完整解压，使 .command 与 .app 在同一文件夹。" as informational' 2>/dev/null || echo "未找到 .app"
  exit 1
fi
open "$APP"
`;

function isMacAppZip(name) {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".zip")) return false;
  if (lower.includes("win") || lower.includes("linux")) return false;
  return lower.includes("mac") || lower.includes("darwin") || /arm64|x64|universal/.test(lower);
}

function patchZip(zipPath) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "sa-mac-patch-"));
  try {
    execFileSync("/usr/bin/unzip", ["-q", zipPath, "-d", tmp], { stdio: "inherit" });
    const scriptPath = path.join(tmp, COMMAND_NAME);
    fs.writeFileSync(scriptPath, SCRIPT, "utf8");
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
