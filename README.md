# 剧本 Script Agent

面向短剧 / 系列剧本创作的本地工作台：立项、改编讨论、分阶段产出（含与 OpenAI 兼容 API 的对话与工具链）。  
Web 应用基于 **Next.js**，可选 **Electron** 桌面封装，便于在未安装 Node 的环境分发。

## 下载安装（推荐给使用者）

正式构建见 GitHub **Releases**（Windows 安装包 / 便携版、macOS `.dmg` 与 `*-mac.zip`）：

**https://github.com/gleam-studios/script--agent/releases**

安装后请在应用内 **「API 设置」** 中填写 API 地址、Key 与模型名称。首次打开、macOS 隔离与 SmartScreen 等问题见 **[desktop/README.md](desktop/README.md)**。

## 仓库结构

| 目录 | 说明 |
|------|------|
| `web/` | Next.js 前端与 API Routes（开发入口） |
| `agent/` | 提示词、模板等 Agent 资源 |
| `knowledge/`、`skills/` | 知识库与技能说明（供服务端拼装上下文） |
| `data/projects/` | 本地项目 JSON（默认不提交，见 `.gitignore`） |
| `desktop/` | Electron 打包脚本、DMG 资源与 [桌面版说明](desktop/README.md) |
| `.github/workflows/` | CI（含桌面双端构建与发版） |

## 本地开发（需 Node.js）

建议使用 **Node 20+**（与 CI 中 Next/Electron 构建一致）。

```bash
cd web
npm install
npm run dev
```

浏览器访问 **http://localhost:4000**（端口在 `web/package.json` 的 `dev` 脚本中配置）。

## 桌面端本地打包（开发者）

```bash
cd web && npm ci && npm run build
cd ../desktop && npm ci && npm run dist
```

产物在 `desktop/release/`。详细说明见 [desktop/README.md](desktop/README.md)。

## 许可证与仓库

若需二次开发或企业内部部署，请根据你们策略自行补充许可证条款；上游依赖以各 `package.json` 为准。

仓库：**https://github.com/gleam-studios/script--agent**
