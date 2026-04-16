"""
桌面版入口：由 Electron 启动（PyInstaller 打包或开发机 venv）。
argv[1] 为端口号（整数）。
"""
from __future__ import annotations

import sys

import uvicorn

import main as wattpad_main  # noqa: F401 — 确保 PyInstaller 打入业务模块


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 18765
    uvicorn.run(wattpad_main.app, host="127.0.0.1", port=port, log_level="info")


if __name__ == "__main__":
    main()
