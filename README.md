# 三月七桌宠 · Web 版（Hardware Pi）

三月七 Electron 桌宠的 Web 迁移版。**前端与桌面版完全一致**（全部面板、样式、Live2D、角色选择），通过 web shim 将 Electron IPC 桥接到 Python FastAPI 后端，适合在树莓派或任何 Linux 上以 Docker 常驻运行，手机/电脑浏览器访问。

## 架构

```
浏览器 ──→ Python FastAPI 服务器
              ├── 提供静态前端（web/dist）
              ├── /api/v1/*  业务 API（对话、记忆、设置等）
              └── SQLite 持久化
```

前端调 `window.marchDesktop.xxx()`，shim 自动路由到 `fetch('/api/v1/...')`。窗口操作（最小化/拖拽/缩放）在浏览器中为空操作。

## 一键部署（Docker）

**1. 安装 Docker**（Pi / Linux）：

```bash
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
```

**2. 克隆并启动**：

```bash
git clone -b 仅桌宠 https://github.com/MihYux/hardware-pi.git
cd hardware-pi
docker compose up -d --build
```

**3. 打开浏览器**：

```
http://<设备IP>:8000
```

首次进入会引导填写 DeepSeek API Key（在设置面板中）。未配置 Key 时自动使用本地回复。

## 功能

- 三月七角色显示（静态立绘 + Live2D 可选）
- DeepSeek 文字对话
- 共同旅行相册（拍照、记忆管理）
- 角色通信中心（消息、已读、收藏）
- 同行设置（称呼、勿扰、暂停、数据导出/删除）
- 本地安全审查与按日预算

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `HARDWARE_PI_PORT` | `8000` | 服务端口 |
| `HARDWARE_PI_DATA_DIR` | `/data` | 数据目录（SQLite + 配置） |

在 `.env` 文件中覆盖（参考 `.env.example`）。数据持久化在 `./.data/` 目录。

## 本地开发

**后端**：

```bash
cd server
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --port 8000
```

**前端**：

```bash
cd web
npm install
npm run dev
```

Vite 开发服务器（`localhost:5173`）自动代理 `/api` 到 FastAPI（`localhost:8000`）。

## 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 19 + TypeScript 7 + Vite 8 + Motion + Phosphor Icons |
| Live2D（可选） | pixi.js 6 + pixi-live2d-display + CubismCore（代码分割，按需加载） |
| 后端 | Python 3.12 + FastAPI + Uvicorn |
| 数据 | SQLite + JSON 配置文件 |
| 部署 | Docker Compose（多阶段构建：Node 编译前端 → Python 运行） |
| AI | DeepSeek Chat Completion API |
| 桥接 | web shim（`window.marchDesktop` → HTTP fetch，零前端改动） |

## 与桌面版的区别

| 项 | 桌面版（Electron） | Web 版 |
| --- | --- | --- |
| 运行 | 本地 Electron 进程 | Docker 容器（Pi / Linux） |
| 访问 | 桌面透明窗口 | 浏览器（手机 / 电脑） |
| 通信 | Electron IPC | HTTP / WebSocket |
| 窗口控制 | 透明/置顶/拖拽/缩放 | 无（浏览器无窗口控制） |
| 数据 | 本地 userData JSON + safeStorage | SQLite + 配置文件 |
| 视觉 | — | **完全一致** |

## 目录结构

```
hardware-pi/
├── web/                # 前端（原版桌面项目源码，原封不动）
│   ├── src/            # React 源码
│   │   ├── shim.ts     # web shim（marchDesktop → HTTP 桥接）
│   │   └── ...
│   ├── shared/         # 角色提示词、配置 JSON
│   └── public/         # 静态资源（角色图、Live2D 模型、CubismCore）
├── server/             # Python 后端
│   ├── app/            # FastAPI 应用
│   └── tests/          # 后端测试
├── shared/             # 跨层共享配置
├── Dockerfile          # 多阶段构建
├── docker-compose.yml  # 部署编排
└── .env.example        # 环境变量示例
```

## 许可

- 代码：MIT
- 角色视觉版权归米哈游 / HoYoverse，仅供非商业同人使用
- Live2D 模型版权归 miHoYo，CubismCore 遵 Live2D Redistributable Code 许可
