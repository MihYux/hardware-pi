# ReHoYo Hardware Pi

面向 Orange Pi 的三月七局域网陪伴终端。Pi 负责模型调用、API Key、角色规则和 SQLite 数据；手机浏览器使用与正式桌宠一致的浅色人物界面，充当显示器和对话入口。

本项目不是 ReHoYo Electron 桌面版的 ARM 安装包。它保留对话、记忆、相册、通信、同行设置和模型控制，移除透明窗口、置顶、托盘、拖窗、多屏适配及桌面安装包等只对 Electron 有意义的功能。

## 当前功能

- 手机 PWA 人物显示与文字对话；
- 首次进入、同行授权、勿扰、暂停和个性化设置；
- 长期记忆、共同旅行相册和角色通信中心；
- DeepSeek、智谱 GLM、CosyVoice 统一 API 控制面板；
- API Key 只保存在 Pi，模型异常时自动使用本地回复；
- OpenAI Chat Completions 兼容 Gateway，可供 ReHoYo 或其他 Python 项目调用；
- Docker Compose 部署、SSH 更新和 SQLite 持久化。

```text
手机 PWA ───────────────┐
ReHoYo 工作台 ──────────┼─> Orange Pi / FastAPI ─> DeepSeek / GLM / CosyVoice
其他 Python 项目 ───────┘              │
                                       └─> SQLite / 角色规则
```

## 部署到 Orange Pi

要求：64 位 Linux、Git、Docker Engine 和 Docker Compose plugin。

仓库是公开仓库，直接使用 HTTPS clone，不需要 SSH Key 或 Deploy Key：

```bash
git clone https://github.com/MihYux/hardware-pi.git
cd hardware-pi
./deploy/install.sh
```

安装脚本会自动：

- 创建 `.env` 和三个随机访问令牌；
- 创建 `.data` 持久化目录；
- 构建并启动容器。

查看 Pi 地址和配对令牌：

```bash
hostname -I
grep '^HARDWARE_PI_.*TOKEN=' .env
```

手机访问：

```text
http://<Orange-Pi-IP>:8000
```

在网页“连接设置”中填写：

- `HARDWARE_PI_DEVICE_TOKEN`：聊天、相册和同行数据；
- `HARDWARE_PI_ADMIN_TOKEN`：模型控制面板。

然后在“设置”中填写 DeepSeek、智谱或 CosyVoice API Key。API Key 不需要复制到手机其他位置。

## 更新

```bash
cd hardware-pi
./deploy/update.sh
```

该脚本会拉取最新代码、重新构建并重启容器，`.env` 和 `.data` 不会被覆盖。

## 检查与排错

```bash
docker compose ps
docker compose logs --tail=200
curl http://127.0.0.1:8000/api/v1/health
```

如果手机无法访问：

1. 确认手机和 Pi 在同一局域网；
2. 确认 `docker compose ps` 中服务状态正常；
3. 确认路由器没有启用客户端隔离；
4. 检查 Pi 防火墙是否允许 TCP `8000`。

不要把 `.env`、`.data`、访问令牌或 API Key 提交到 Git，也不要把端口直接暴露到公网。

## 接入 ReHoYo

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=<HARDWARE_PI_SERVICE_TOKEN>
DEEPSEEK_BASE_URL=http://<Orange-Pi-IP>:8000/api/openai/v1
```

ReHoYo 会通过 Pi Gateway 使用控制面板选择的模型，不再保存真实 DeepSeek Key。

完整接口见 [API 文档](docs/API.md)，迁移状态见 [迁移计划](docs/MIGRATION_PLAN.md)。

## 尚未完成

- CosyVoice 流式语音；
- 主动联系、勿扰和完整频率执行策略；
- ReHoYo 角色发行交付包消费；
- 正式桌面版旧数据导入工具。
