# ReHoYo Hardware Pi

这是 [ReHoYo 正式版](https://github.com/MihYux/ReHoYo) 的 Orange Pi 网页运行版。与正式版相比，本仓库只移除 Electron 外壳和桌面窗口能力，保留两个核心模块：

- ReHoYo 全球发行工作台：沿用正式版 Next.js 页面、工作流和本地数据逻辑；
- 三月七桌宠：手机浏览器显示人物，并提供对话、相册、通信、同行设置和 API 控制面板。

透明窗口、置顶、托盘、拖窗、多屏适配和 Electron 安装包不会迁入。模型密钥统一保存在 Pi，工作台与桌宠都通过同一控制面板选择 DeepSeek、智谱 GLM 或 CosyVoice。

当前 0.6.1 已完成正式版核心链路的无 Electron 迁移：

- 工作台发布不可变交付包后，Pi 会校验 checksum 和玩家可见字段，再依据主动联系授权、暂停、勿扰、24 小时间隔、每周上限、版本消息频率和召回授权决定发送或延后；内容还会经过本地安全规则与可降级的模型语义评审，最终进入手机通信中心。非法交付会进入隔离目录，不会影响主服务。
- CosyVoice 保留原版复刻音色 ID、声音授权确认、语速、音量、手动播放和自动朗读。Pi 代为请求 DashScope，再通过 SSE/PCM 流式队列发给手机；真实 API Key 不会离开 Pi。
- 同行设置中的“导入正式版 v4”可以合并正式桌面版隐私导出或记忆导出。它只迁移同行偏好、可管理记忆和已审核通信，不导入 API Key、自由聊天、Campaign 后台数据或执行日志；重复导入不会产生副本。

## 部署到 Orange Pi

要求：64 位 Linux、Git、Docker Engine 和 Docker Compose plugin。

仓库是公开仓库，使用 HTTPS clone，不需要 SSH Key：

```bash
git clone https://github.com/MihYux/hardware-pi.git
cd hardware-pi
./deploy/install.sh
```

脚本会创建 `.env`、随机访问令牌和 `.data`，然后构建并启动两个模块。

查看 Pi 地址和令牌：

```bash
hostname -I
grep '^HARDWARE_PI_.*TOKEN=' .env
```

默认访问地址：

```text
三月七桌宠与控制面板  http://<Orange-Pi-IP>:8000
ReHoYo 工作台         http://<Orange-Pi-IP>:3000
```

端口可在 `.env` 中通过 `HARDWARE_PI_PORT` 和 `HARDWARE_PI_WORKBENCH_PORT` 修改。

## 首次设置

在 `8000` 页面打开“连接设置”：

- `HARDWARE_PI_DEVICE_TOKEN`：桌宠对话、相册和同行数据；
- `HARDWARE_PI_ADMIN_TOKEN`：统一模型控制面板。

然后在“设置”中填写模型 API Key，并选择：

- 工作台生成使用的 Provider；
- 桌宠对话与发送前评审使用的 Provider；
- 区域联网研究使用的智谱配置；
- 语音阶段使用的 CosyVoice 配置。

真实 API Key 不会发送到手机或工作台容器。工作台使用内部服务令牌调用 Pi Gateway。

默认 DeepSeek 模型与正式版一致，为 `deepseek-v4-flash`。CosyVoice 需要分别配置模型 ID、复刻音色 ID 和 DashScope API Key；正式版默认模型 ID 为 `cosyvoice-v3.5-flash`，默认复刻音色 ID 已预填。默认音色能否使用取决于 DashScope 账号和业务空间权限，若提示无权访问，请替换为该账号下可用的音色 ID。

在“语音”页确认你对声音样本、复刻音色和当前用途拥有必要授权，检查音色 ID 后启用语音。手机浏览器通常允许点击喇叭后播放；自动朗读若被系统拦截，先手动播放一次即可解锁音频上下文。

## 更新

```bash
cd hardware-pi
./deploy/update.sh
```

更新不会覆盖 `.env` 和 `.data`。

## 检查与排错

```bash
docker compose ps
docker compose logs --tail=200
curl http://127.0.0.1:8000/api/v1/health
curl http://127.0.0.1:3000/api/project/current
```

手机无法访问时，确认手机和 Pi 在同一局域网、路由器未启用客户端隔离，并允许 TCP `8000` 与 `3000`。不要把 `.env`、`.data`、访问令牌或 API Key 提交到 Git，也不要直接暴露到公网。

## 数据位置

- 统一模型设置：`.data/control-plane.json`
- 桌宠会话与同行数据：`.data/hardware-pi.db`
- 工作台项目、来源与发行数据：`.data/workbench/`
- 工作台与桌宠发行桥：`.data/bridge/`

接口与鉴权见 [docs/API.md](docs/API.md)，迁移边界见 [docs/MIGRATION_PLAN.md](docs/MIGRATION_PLAN.md)。

## 尚未完成

- Orange Pi ARM64 上的发行桥接、CosyVoice 播放和断电恢复真机验收；
- 可选的手机麦克风 STT（不影响文字对话和语音输出）。
