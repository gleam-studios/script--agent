#!/usr/bin/env bash
set -euo pipefail
# 从 web/scripts 定位到仓库根目录
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT/services/wattpad-api"

if [[ ! -d .venv ]]; then
  echo "创建 Python 虚拟环境 .venv …"
  python3 -m venv .venv
fi
# shellcheck source=/dev/null
source .venv/bin/activate
pip install -q -r requirements.txt

echo "Wattpad API: http://127.0.0.1:8765  (Ctrl+C 停止)"
exec uvicorn main:app --host 127.0.0.1 --port 8765
