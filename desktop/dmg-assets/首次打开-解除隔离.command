#!/bin/bash
# 与 zip 包 / .dmg 安装盘共用：优先解除「应用程序」内已安装应用的隔离；否则处理与本脚本同目录的 .app。
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_APPS="/Applications/Script Agent.app"

if [ -d "$APP_APPS" ]; then
  xattr -cr "$APP_APPS"
  open "$APP_APPS"
  exit 0
fi

cd "$SCRIPT_DIR"
xattr -cr .
for d in *.app; do
  if [ -d "$d" ]; then
    xattr -cr "$d"
    open "$d"
    exit 0
  fi
done

osascript -e 'display dialog "未找到 Script Agent。\n\n• 使用 .dmg：请先将应用拖入「应用程序」，再按说明打开一次后运行本脚本。\n• 使用 .zip：请将 .command 与 .app 放在同一文件夹。" buttons {"好"} default button 1' 2>/dev/null || true
exit 1
