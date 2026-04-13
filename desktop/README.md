# Script Agent 桌面版

## 下载后怎么用

### macOS（从 GitHub 下载的 `.dmg`）

1. 双击挂载安装盘，窗口内可见 **安装说明.txt**、**首次打开-解除隔离.command**、应用图标以及右侧 **应用程序** 快捷方式。
2. 按 **安装说明.txt** 三步操作：**先**把「Script Agent」拖进「应用程序」；**再**从「应用程序」或「启动台」里首次打开一次应用；**最后**回到安装盘窗口，双击 **首次打开-解除隔离.command**（脚本会优先为 `/Applications` 里的应用去隔离并启动）。
3. 若脚本无法双击：按住 **Control** 点脚本 → **打开**；或在终端执行：  
   `bash "/Volumes/安装盘名/首次打开-解除隔离.command"`（路径按实际挂载卷名修改）。

### macOS（从 GitHub 下载的 `*-mac.zip`）

1. **完整解压** zip（解压后应同时看到 `Script Agent.app` 与 **`首次打开-解除隔离.command`**）。
2. **双击** `首次打开-解除隔离.command`：脚本会为同目录下的 `.app` 去隔离并打开（若你已安装到「应用程序」，会优先处理 `/Applications/Script Agent.app`）。
3. 若系统不允许运行该脚本：按住 **Control** 点脚本 → **打开**；或在「终端」进入解压目录后执行：  
   `bash ./首次打开-解除隔离.command`

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
