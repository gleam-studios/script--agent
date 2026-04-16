"""
在**当前操作系统**下用 PyInstaller 生成 onedir 产物，复制到 desktop/resources/wattpad-api-bin/
供 electron-builder extraResources 打包。

构建前请已安装：本脚本会用当前 python 执行 pip install pyinstaller 与 requirements.txt
"""
from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPO = ROOT.parent.parent
DESKTOP_RESOURCES = REPO / "desktop" / "resources"
DEST = DESKTOP_RESOURCES / "wattpad-api-bin"
DIST_DIR = ROOT / "dist" / "wattpad-api"


def pip_install(*args: str) -> None:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", *args], cwd=ROOT)


def main() -> None:
    pip_install("pyinstaller")
    pip_install("-r", str(ROOT / "requirements.txt"))

    if DIST_DIR.exists():
        shutil.rmtree(DIST_DIR)
    build_root = ROOT / "dist"
    if build_root.exists():
        # 仅清掉本次 name，避免误删其它 dist
        for p in build_root.iterdir():
            if p.name == "wattpad-api":
                shutil.rmtree(p, ignore_errors=True)

    hidden = [
        "main",
        "wattpad_tool",
        "wattpad_export",
        "wattpad_cookies",
        "translate_wattpad_html",
        "docx_renderer",
        "bs4",
        "docx",
        "requests",
    ]
    hi = []
    for m in hidden:
        hi.extend(["--hidden-import", m])

    cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--onedir",
        "--name",
        "wattpad-api",
        "--clean",
        "-y",
        "--noconfirm",
        "--noconsole",
        "--collect-all",
        "uvicorn",
        "--collect-all",
        "starlette",
        "--collect-all",
        "pydantic",
        "--collect-all",
        "fastapi",
        *hi,
        str(ROOT / "run_desktop.py"),
    ]
    subprocess.check_call(cmd, cwd=ROOT)

    if not DIST_DIR.is_dir():
        raise SystemExit(f"[build_desktop_bundle] PyInstaller output missing: {DIST_DIR}")

    DESKTOP_RESOURCES.mkdir(parents=True, exist_ok=True)
    if DEST.exists():
        shutil.rmtree(DEST)
    shutil.copytree(DIST_DIR, DEST)
    print(f"[build_desktop_bundle] copied to {DEST}")


if __name__ == "__main__":
    main()
