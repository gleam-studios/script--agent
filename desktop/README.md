# Script Agent 桌面版

## 下载后怎么用

### macOS：提示「已损坏，无法打开。你应该将它移到废纸篓」

这是 **未在 Apple 公证** 的应用被系统拦截时的常见提示，**不一定是文件真的损坏**。可先按顺序尝试：

**方法一（推荐）：去掉隔离属性**

把「Script Agent」拖进 **应用程序** 或放在你能找到的位置，然后打开「终端」，执行（请把路径改成你的 `.app` 实际路径）：

```bash
xattr -cr "/Applications/Script Agent.app"
open "/Applications/Script Agent.app"
```

若 App 还在「下载」里：

```bash
xattr -cr ~/Downloads/Script\ Agent.app
open ~/Downloads/Script\ Agent.app
```

不确定路径时：在 Finder 里选中 `Script Agent.app`，按 `⌘⌥C` 拷贝路径，把上面命令里的引号内路径替换掉。

**方法二：右键打开**

按住 `Control` 点 `Script Agent.app` → **打开** → 在对话框里再选 **打开**。

**方法三：系统设置**

先 **双击一次** 触发失败，再打开 **系统设置 → 隐私与安全性**，在页面下方查找与 **Script Agent** 相关的 **仍要打开**（部分系统版本文案或位置略有不同；若没有，请用方法一）。

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
