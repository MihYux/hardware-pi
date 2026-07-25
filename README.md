# ReHoYo Hardware Pi

> [!IMPORTANT]
> 本仓库是面向 Orange Pi 的专用版本，不是 [ReHoYo 正式桌面版](https://github.com/MihYux/ReHoYo) 的 ARM 安装包，也不追求逐项复制 Electron 界面。Pi 负责持续运行陪伴服务和统一管理 API，手机浏览器负责显示人物与对话；只对桌面窗口有意义的能力会永久移除。

ReHoYo Hardware Pi 是从 ReHoYo 三月七 Electron 桌宠迁移出来的局域网陪伴终端，适合嵌入更大的硬件或 Python 项目。Orange Pi 负责模型调用、密钥、会话和角色规则；手机浏览器作为人物显示器和对话界面。

## 与正式桌面版的主要变化

| 项目 | ReHoYo 正式桌面版 | Hardware Pi 专用版 |
| --- | --- | --- |
| 产品定位 | 全球发行工作台 + Electron 三月七桌宠 | 无头陪伴服务 + 手机人物显示器 + 统一 API 控制面板 |
| 运行方式 | 在 macOS / Windows / Linux 桌面启动 Electron | 在 Orange Pi 上常驻 FastAPI，手机安装或打开 PWA |
| 交互入口 | 透明置顶桌宠窗口和桌面主面板 | 手机浏览器中的全屏人物、聊天和管理界面 |
| 应用通信 | Electron IPC 和本机文件桥接 | 局域网 HTTP、WebSocket 和 OpenAI 兼容 Gateway |
| API 配置 | 工作台与桌宠分别读取配置 | DeepSeek、智谱 GLM、CosyVoice 在 Pi 上统一配置，其他项目只连接 Pi |
| 数据保存 | Electron `userData` 中的 JSON 和安全存储 | Pi 数据目录中的受限配置文件与 SQLite |
| 部署更新 | npm、Electron 打包和桌面安装包 | Docker Compose、SSH 更新和 systemd 自启动 |
| 硬件集成 | 主要面向桌面操作系统 | 可由更大的 Python 项目通过局域网 API 接入 |

### Pi 版永久移除的桌面功能

以下能力不会进入 Hardware Pi 的迁移待办：

- Electron / Chromium 桌面外壳和 Electron IPC；
- 透明无边框窗口、置顶、最小化、关闭和托盘隐藏；
- 鼠标拖动桌宠、四边吸附、窗口位置记忆、窗口缩放和多屏保护；
- macOS 工作区、全屏空间以及 Windows / Linux 桌面窗口适配；
- Electron 安装包、代码签名、桌面自动更新和桌面进程看门狗；
- 在 Pi 中复制 ReHoYo 全球发行工作台界面。正式工作台或更大的项目通过 Gateway 使用 Pi 的模型和陪伴能力。

手机全屏显示、PWA 安装、Docker/systemd 常驻和 SSH 更新分别承担这些能力在硬件场景中的实际职责。上述删除只涉及桌面外壳，不代表删除人物对话、记忆、相册、通信、语音、安全策略或角色发行桥接等陪伴业务能力。

当前版本是迁移第一阶段，已经具备：

- 不依赖 Electron 的手机 PWA；
- 三月七人物显示、表情状态和文字对话；
- DeepSeek、智谱 GLM、CosyVoice 统一 API 控制面板；
- API Key 仅保存在 Pi，浏览器只看到掩码；
- DeepSeek 未配置或异常时自动使用本地回复；
- 基础输入和输出安全检查；
- SQLite 会话记录；
- OpenAI Chat Completions 兼容 Gateway；
- Docker Compose、SSH 更新脚本和 systemd 模板。

## 架构

```text
手机 PWA ───────────────┐
ReHoYo 工作台 ──────────┼─> FastAPI Control Plane ─> DeepSeek / GLM / CosyVoice
大型 Python 项目 ───────┘             │
                                      └─> SQLite / 角色规则
```

## Orange Pi 快速部署

要求：

- 64 位 Linux；
- Git；
- Docker Engine；
- Docker Compose plugin。

在 Pi 上生成专用 SSH Key，并把公钥添加为本仓库的只读 GitHub Deploy Key：

```bash
ssh-keygen -t ed25519 -f ~/.ssh/hardware-pi-deploy
```

在 `~/.ssh/config` 中给这把 Key 添加独立主机别名：

```sshconfig
Host github-hardware-pi
  HostName github.com
  User git
  IdentityFile ~/.ssh/hardware-pi-deploy
  IdentitiesOnly yes
```

然后：

```bash
git clone git@github-hardware-pi:MihYux/hardware-pi.git
cd hardware-pi
./deploy/install.sh
```

脚本会：

1. 从 `.env.example` 创建 `.env`；
2. 自动生成三个随机访问令牌；
3. 创建权限受限的数据目录；
4. 构建 ARM64 兼容容器；
5. 启动服务。

填写模型 Key：

```bash
nano .env
docker compose up -d
```

手机访问：

```text
http://<Orange-Pi-IP>:8000
```

从 `.env` 复制设备令牌和管理令牌到手机的“配对设置”。模型 API Key 不需要复制到手机。

## SSH 更新

```bash
ssh orangepi@orange-pi.local \
  'cd hardware-pi && ./deploy/update.sh'
```

## 本地开发

后端：

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

前端：

```bash
cd web
npm install
npm run dev
```

打开 `http://localhost:5173`。Vite 会把 `/api` 代理到 FastAPI。

## 接入 ReHoYo

控制面板保存 DeepSeek Key 后，在 ReHoYo 中配置：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=<HARDWARE_PI_SERVICE_TOKEN>
DEEPSEEK_BASE_URL=http://orange-pi.local:8000/api/openai/v1
```

工作台会通过 Pi Gateway 使用控制面板选定的模型，因此不再需要保存真实 DeepSeek Key。

完整协议见 [docs/API.md](docs/API.md)，后续迁移安排见 [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)。

## 数据与安全

- 统一配置：`.data/control-plane.json`，权限为 `0600`；
- 对话数据库：`.data/hardware-pi.db`；
- 三种访问令牌必须互不相同；
- 不要把 `.env`、`.data` 或 API Key 提交到 Git；
- 默认只适合可信局域网，不要把端口直接映射到公网；
- 麦克风和语音阶段会加入局域网 HTTPS。

## 计划继续迁移

- 长期记忆、相册和通信中心；
- 首次进入、授权、数据导出和关系控制；
- CosyVoice 流式语音；
- 主动联系、勿扰和完整频率策略；
- ReHoYo 角色发行交付包消费；

这些能力会按照迁移计划逐步加入。

## 暂不纳入当前范围

- GPIO、摄像头、传感器和其他具体 Orange Pi 外设；
- 公网直接访问和多租户云服务；
- Live2D / Spine 模型。

这些能力不是桌面版迁移的必要条件。后续由上层硬件项目按设备需求通过 API 扩展，避免 Hardware Pi 和某一块开发板或外设过度耦合。
