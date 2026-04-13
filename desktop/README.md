# Script Agent 桌面版

## 下载后怎么用

### macOS（从 GitHub 下载的 `*-mac.zip`）

1. **完整解压** zip（解压后应同时看到 `Script Agent.app` 与 **`首次打开-解除隔离.command`**）。
2. **优先双击** `首次打开-解除隔离.command`：脚本会对**当前文件夹**执行 `xattr -cr`（去掉隔离）并打开应用。
3. 若系统不允许运行该脚本：按住 **Control** 点脚本 → **打开**；或在「终端」进入解压目录后执行：  
   `bash ./首次打开-解除隔离.command`

> **说明**：`.dmg` 安装包内可能不含该脚本，请用下文「手动去掉隔离」。

### macOS：提示「已损坏，无法打开。你应该将它移到废纸篓」

这是 **未在 Apple 公证** 的应用被拦截时的常见提示，**不一定是文件真的损坏**。若没有使用上面的 `.command`，可手动操作：

**手动去掉隔离（终端）**

```bash
xattr -cr "/Applications/Script Agent.app"
open "/Applications/Script Agent.app"
```

路径按你的 `.app` 实际位置修改；若 App 在「下载」里可把引号内换成 `~/Downloads/Script Agent.app` 等。

**右键打开**

按住 `Control` 点 `Script Agent.app` → **打开** → 再选 **打开**。

**系统设置**

先 **双击一次** 触发失败，再打开 **系统设置 → 隐私与安全性**，看是否出现 **仍要打开**（部分系统可能没有）。

---

### Windows

若出现 **Windows 已保护你的电脑**（SmartScreen），点 **更多信息** → **仍要运行**。未签名的安装包会这样提示，属正常现象。

---

## 开发者：本地打包

```bash
cd web && npm ci && npm run build   # 如需先构建 Next
cd ../desktop && npm ci && npm run dist
```

产物在 `desktop/release/`。CI 成功时也可在 GitHub Actions → 对应运行 → **Artifacts** 下载。
