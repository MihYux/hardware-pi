# ReHoYo Hardware Pi

ReHoYo Hardware Pi 是从三月七 Electron 桌宠迁移出来的局域网陪伴终端。Orange Pi 负责模型调用、密钥、会话和角色规则；手机浏览器作为人物显示器和对话界面。

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

## 当前未迁移

- 长期记忆、相册和通信中心；
- CosyVoice 流式语音；
- 主动联系、勿扰和完整频率策略；
- ReHoYo 角色发行交付包消费；
- GPIO、摄像头或其他 Orange Pi 硬件能力。

这些能力会按照迁移计划逐步加入。
