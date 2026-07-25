# ReHoYo Hardware Pi

这是 [ReHoYo 正式版](https://github.com/MihYux/ReHoYo) 的 Orange Pi 网页运行版。与正式版相比，本仓库只移除 Electron 外壳和桌面窗口能力，保留两个核心模块：

- ReHoYo 全球发行工作台：沿用正式版 Next.js 页面、工作流和本地数据逻辑；
- 三月七桌宠：手机浏览器显示人物，并提供对话、相册、通信、同行设置和 API 控制面板。

透明窗口、置顶、托盘、拖窗、多屏适配和 Electron 安装包不会迁入。模型密钥统一保存在 Pi，工作台与桌宠都通过同一控制面板选择 DeepSeek、智谱 GLM 或 CosyVoice。

当前 0.7.0 已完成正式版核心链路的无 Electron 迁移，并把部署目标调整为“一次安装即可运行”：

- 工作台发布不可变交付包后，Pi 会校验 checksum 和玩家可见字段，再依据主动联系授权、暂停、勿扰、24 小时间隔、每周上限、版本消息频率和召回授权决定发送或延后；内容还会经过本地安全规则与可降级的模型语义评审，最终进入手机通信中心。非法交付会进入隔离目录，不会影响主服务。
- CosyVoice 保留原版复刻音色 ID、声音授权确认、语速、音量、手动播放和自动朗读。Pi 代为请求 DashScope，再通过 SSE/PCM 流式队列发给手机；真实 API Key 不会离开 Pi。
- 同行设置中的“导入正式版 v4”可以合并正式桌面版隐私导出或记忆导出。它只迁移同行偏好、可管理记忆和已审核通信，不导入 API Key、自由聊天、Campaign 后台数据或执行日志；重复导入不会产生副本。
- Orange Pi 默认从 GHCR 拉取与当前 Git commit 对应的 ARM64 预构建镜像，不再在 Pi 上执行 npm、Vite 和 Next.js 编译；镜像尚未发布或拉取失败时会自动回退到本地构建。
- 默认使用可信局域网免鉴权模式，手机打开页面即可连接；旧版手机浏览器不支持 `crypto.randomUUID()` 时也可以正常点击人物、聊天和创建本地会话。

## 部署到 Orange Pi

要求：64 位 Linux、Git、Docker Engine 和 Docker Compose plugin。

仓库是公开仓库，使用 HTTPS clone，不需要 SSH Key：

```bash
git clone https://github.com/MihYux/hardware-pi.git
cd hardware-pi
./deploy/install.sh
```

首次安装会在命令行询问 DeepSeek、智谱和 DashScope API Key。输入内容不会回显，可以直接回车跳过；配置会写入 Pi 的 `.env`，然后脚本优先拉取 ARM64 预构建镜像并启动两个模块。

默认访问地址：

```text
三月七桌宠与控制面板  http://<Orange-Pi-IP>:8000
ReHoYo 工作台         http://<Orange-Pi-IP>:3000
```

端口可在 `.env` 中通过 `HARDWARE_PI_PORT` 和 `HARDWARE_PI_WORKBENCH_PORT` 修改。

## 首次设置

默认 `HARDWARE_PI_AUTH_MODE=off`，只要手机和 Pi 在同一可信局域网，打开 `8000` 页面后会自动连接，不需要填写设备令牌或管理令牌。不要将这两个端口直接暴露到公网。

模型 API Key 可以在安装阶段写入，也可以随后执行：

```bash
./deploy/configure.sh
./deploy/update.sh
```

然后在网页“设置”中选择：

- 工作台生成使用的 Provider；
- 桌宠对话与发送前评审使用的 Provider；
- 区域联网研究使用的智谱配置；
- 语音阶段使用的 CosyVoice 配置。

真实 API Key 不会返回手机。控制面板的“保存并测试”会先保存当前卡片中的 Base URL、模型 ID 和新 API Key，再实际请求模型，并在按钮下方显示成功延迟或具体错误。

默认 DeepSeek 模型与正式版一致，为 `deepseek-v4-flash`。CosyVoice 直接复用正式版 [shared/cosyvoice-config.json](shared/cosyvoice-config.json)：模型 ID 为 `cosyvoice-v3.5-flash`，你制作的复刻音色 ID 为 `cosyvoice-v3.5-flash-marchpet-eb86bcaeea5f40669b1798191950529a`，DashScope API Key 独立保存在 Pi。

在“语音”页确认你对声音样本、复刻音色和当前用途拥有必要授权，检查音色 ID 后启用语音。手机浏览器通常允许点击喇叭后播放；自动朗读若被系统拦截，先手动播放一次即可解锁音频上下文。

## 更新

```bash
cd hardware-pi
./deploy/update.sh
```

更新不会覆盖 `.env` 和 `.data`。

默认更新只下载当前提交对应的 ARM64 镜像层。如果 GHCR 暂时不可用，脚本会自动回退到本地构建。也可以手动强制使用本地构建：

```bash
./deploy/build-local.sh
```

根目录 `.dockerignore` 会排除 `node_modules`、`.next`、虚拟环境和本地数据，BuildKit 会复用 npm 与 pip 下载缓存。

## 检查与排错

```bash
docker compose ps
docker compose logs --tail=200
curl http://127.0.0.1:8000/api/v1/health
curl http://127.0.0.1:3000/api/project/current
```

手机无法访问时，确认手机和 Pi 在同一局域网、路由器未启用客户端隔离，并允许 TCP `8000` 与 `3000`。网页能打开但一直无法进入“陪伴中”时，检查健康接口返回的 `authentication.mode` 是否为 `off`，并完全关闭后重新打开手机 PWA 以更新缓存。不要把 `.env`、`.data` 或 API Key 提交到 Git，也不要直接暴露到公网。

需要恢复令牌鉴权时，将 `.env` 中的 `HARDWARE_PI_AUTH_MODE` 改为 `token` 并配置三个不同的长随机令牌；这不是当前局域网首次部署的必需步骤。

## 数据位置

- 统一模型设置：`.data/control-plane.json`
- 桌宠会话与同行数据：`.data/hardware-pi.db`
- 工作台项目、来源与发行数据：`.data/workbench/`
- 工作台与桌宠发行桥：`.data/bridge/`

接口与鉴权见 [docs/API.md](docs/API.md)，迁移边界见 [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)。

## 尚未完成

- Orange Pi ARM64 上的发行桥接、CosyVoice 播放和断电恢复真机验收；
- 可选的手机麦克风 STT（不影响文字对话和语音输出）。
