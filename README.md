# ReHoYo Hardware Pi

这是 [ReHoYo 正式版](https://github.com/MihYux/ReHoYo) 的 Orange Pi 网页运行版。与正式版相比，本仓库只移除 Electron 外壳和桌面窗口能力，保留两个核心模块：

- ReHoYo 全球发行工作台：沿用正式版 Next.js 页面、工作流和本地数据逻辑；
- 三月七桌宠：手机浏览器显示人物，并提供对话、相册、通信、同行设置和 API 控制面板。

透明窗口、置顶、托盘、拖窗、多屏适配和 Electron 安装包不会迁入。模型密钥统一保存在 Pi，工作台与桌宠都通过同一控制面板选择 DeepSeek、智谱 GLM 或 CosyVoice。

当前 0.8.1 已完成正式版核心链路的无 Electron 迁移，并把部署目标调整为“一次安装即可运行”：

- 工作台发布不可变交付包后，Pi 会校验 checksum 和玩家可见字段，再依据主动联系授权、暂停、勿扰、24 小时间隔、每周上限、版本消息频率和召回授权决定发送或延后；内容还会经过本地安全规则与可降级的模型语义评审，最终进入手机通信中心。非法交付会进入隔离目录，不会影响主服务。
- CosyVoice 保留原版复刻音色 ID、声音授权确认、语速、音量、手动播放和自动朗读。Pi 代为请求 DashScope，再通过 SSE/PCM 流式队列发给手机；真实 API Key 不会离开 Pi。
- 同行设置中的“导入正式版 v4”可以合并正式桌面版隐私导出或记忆导出。它只迁移同行偏好、可管理记忆和已审核通信，不导入 API Key、自由聊天、Campaign 后台数据或执行日志；重复导入不会产生副本。
- Orange Pi 默认下载 GitHub Release 中的原生 ARM64 发布包，由 systemd 运行 FastAPI 与 Next.js standalone；发布包携带 Node 22、前端构建产物和 Python 3.11、3.12、3.13 ARM64 wheels，兼容 Debian Trixie，不要求安装 Docker，也不会在 Pi 上执行 npm、Vite 或 Next.js 编译。
- 默认使用可信局域网免鉴权模式，手机打开页面即可连接；旧版手机浏览器不支持 `crypto.randomUUID()` 时也可以正常点击人物、聊天和创建本地会话。

## 部署到 Orange Pi

要求：ARM64 Debian、Ubuntu 或 Orange Pi OS，能够使用 `sudo` 和 systemd，系统 Python 为 3.11、3.12 或 3.13。安装器会通过 `apt` 自动补齐 CA 证书、curl、Python、venv、pip、tar、gzip 与基础 C++ 运行库；Node 22 已包含在发布包中。

仓库是公开仓库，使用 HTTPS clone，不需要 SSH Key：

```bash
git clone https://github.com/MihYux/hardware-pi.git
cd hardware-pi
sudo ./deploy/install-native.sh
```

首次安装会校验发布包 checksum、创建低权限 `rehoyo` 用户、安装离线 Python wheels、注册两个 systemd 服务，并询问 DeepSeek、智谱和 DashScope API Key。输入内容不会回显，可以直接回车跳过。

程序、配置与数据分别存放：

```text
/opt/rehoyo/releases/<commit>/    不可变程序版本
/etc/rehoyo/hardware-pi.env       API Key、端口与鉴权配置
/var/lib/rehoyo/                  记忆、相册、工作台与发行桥数据
```

### 从当前 Docker 版本切换

先停止并删除本项目的容器与 Compose 网络：

```bash
cd ~/hardware-pi
docker compose down --remove-orphans
sudo ./deploy/install-native.sh
```

这不会删除 `.env`、`.data` 或 Docker 镜像。原生安装器第一次运行时会自动导入当前仓库的 `.env` 和 `.data`。确认两个网页和原有数据正常后，再决定是否卸载整台 Pi 的 Docker Engine；不要在验证前执行 `docker system prune` 或删除仓库。

默认访问地址：

```text
三月七桌宠与控制面板  http://<Orange-Pi-IP>:8000
ReHoYo 工作台         http://<Orange-Pi-IP>:3000
```

端口可在 `/etc/rehoyo/hardware-pi.env` 中通过 `HARDWARE_PI_PORT` 和 `HARDWARE_PI_WORKBENCH_PORT` 修改。

## 首次设置

默认 `HARDWARE_PI_AUTH_MODE=off`，只要手机和 Pi 在同一可信局域网，打开 `8000` 页面后会自动连接，不需要填写设备令牌或管理令牌。不要将这两个端口直接暴露到公网。

模型 API Key 可以在安装阶段写入，也可以随后执行：

```bash
sudo rehoyo configure
```

然后在网页“设置”中选择：

- 工作台生成使用的 Provider；
- 桌宠对话与发送前评审使用的 Provider；
- 区域联网研究使用的智谱配置；
- 语音阶段使用的 CosyVoice 配置。

真实 API Key 不会返回手机。控制面板的“保存并测试”会先保存当前卡片中的 Base URL、模型 ID 和新 API Key，再实际请求模型，并在按钮下方显示成功延迟或具体错误。

如果手机仍显示旧页面、旧令牌或认证错误，打开网页设置中的“认证与网站缓存”，点击“一键清除并刷新”。它会注销旧 Service Worker、删除本站缓存以及浏览器中的令牌和会话 ID，再从 Pi 重新载入；不会删除 Pi 上的 API Key、长期记忆、相册或工作台数据。

默认 DeepSeek 模型与正式版一致，为 `deepseek-v4-flash`。CosyVoice 直接复用正式版 [shared/cosyvoice-config.json](shared/cosyvoice-config.json)：模型 ID 为 `cosyvoice-v3.5-flash`，你制作的复刻音色 ID 为 `cosyvoice-v3.5-flash-marchpet-eb86bcaeea5f40669b1798191950529a`，DashScope API Key 独立保存在 Pi。

在“语音”页确认你对声音样本、复刻音色和当前用途拥有必要授权，检查音色 ID 后启用语音。手机浏览器通常允许点击喇叭后播放；自动朗读若被系统拦截，先手动播放一次即可解锁音频上下文。

> [!WARNING]
> 当前版本只实现了 DashScope CosyVoice 专用 TTS 链路。`cosyvoice-v3.5-flash` 与上述复刻音色是否可用，取决于账号、区域、API 权限、音色状态以及供应商后续调整，不能保证所有部署环境都可直接调用。如果该模型或音色不可用，仅替换网页中的模型 ID 不一定能够解决；还需要修改服务端请求、鉴权、流式音频解析和前端配置，为项目增加可插拔的自定义 TTS Provider 与自定义语音模型能力。

## 更新

```bash
sudo rehoyo update
```

更新只下载约定的公开 ARM64 Release、校验 checksum、准备新版本目录并切换软链接，不覆盖配置和数据。健康检查失败时 API 会自动回到上一版本；也可以手动执行：

```bash
sudo rehoyo rollback
```

Docker 部署仍作为备用方式保留。需要回到容器时，先执行 `sudo rehoyo stop`，然后运行 `./deploy/install.sh`；本地构建备用命令仍为 `./deploy/build-local.sh`。

## 检查与排错

```bash
rehoyo status
rehoyo logs
rehoyo logs -f
curl http://127.0.0.1:8000/api/v1/health
curl http://127.0.0.1:3000/api/project/current
```

手机无法访问时，确认手机和 Pi 在同一局域网、路由器未启用客户端隔离，并允许 TCP `8000` 与 `3000`。网页能打开但一直无法进入“陪伴中”时，检查健康接口返回的 `authentication.mode` 是否为 `off`，并完全关闭后重新打开手机 PWA 以更新缓存。不要把 `.env`、`.data` 或 API Key 提交到 Git，也不要直接暴露到公网。

需要恢复令牌鉴权时，将 `/etc/rehoyo/hardware-pi.env` 中的 `HARDWARE_PI_AUTH_MODE` 改为 `token` 并配置三个不同的长随机令牌，再运行 `sudo rehoyo restart`；这不是当前局域网首次部署的必需步骤。

## 数据位置

- 统一模型设置：`/var/lib/rehoyo/control-plane.json`
- 桌宠会话与同行数据：`/var/lib/rehoyo/hardware-pi.db`
- 工作台项目、来源与发行数据：`/var/lib/rehoyo/workbench/`
- 工作台与桌宠发行桥：`/var/lib/rehoyo/bridge/`

接口与鉴权见 [docs/API.md](docs/API.md)，迁移边界见 [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)。

## 尚未完成

- Orange Pi ARM64 上的发行桥接、CosyVoice 播放和断电恢复真机验收；
- 可选的手机麦克风 STT（不影响文字对话和语音输出）。
