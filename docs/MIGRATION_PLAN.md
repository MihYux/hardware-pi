# 从 Electron 桌宠迁移到 Hardware Pi

Hardware Pi 是面向 Orange Pi 的专用运行时，不是 ReHoYo 正式桌面版的 ARM 复刻。迁移原则是保留陪伴业务能力，用局域网 API 和手机 PWA 替换桌面交互，并永久删除只对 Electron 窗口有意义的实现。

## 当前里程碑

第一阶段目标是建立不依赖 Electron 的可运行基础：

- Python FastAPI 局域网服务；
- 手机 PWA 人物显示与文字对话；
- DeepSeek / 智谱 / CosyVoice 统一配置；
- OpenAI 兼容 Gateway；
- 本地离线回复与基础输入输出安全检查；
- SQLite 会话记录；
- Docker 与 SSH 部署。

## 能力保留与替换

| 原 IPC | Hardware Pi |
| --- | --- |
| `ai:get-settings` | `GET /api/v1/control/settings` |
| `ai:save-settings` | `PUT /api/v1/control/settings` |
| `ai:test-connection` | `POST /api/v1/control/providers/:name/test` |
| `ai:chat` | `POST /api/v1/chat` / WebSocket |
| `companion:get-data` | 后续迁移为 `/api/v1/companion/snapshot` |
| `companion:*memory*` | 后续迁移为 `/api/v1/memories` |
| `companion:*message*` | 后续迁移为 `/api/v1/communications` |
| `tts:*` | 后续迁移为 `/api/v1/tts` 与音频流 |
| `window:*` | 永久移除，由手机 PWA 和系统服务承担显示与常驻职责 |

## 永久移除

以下内容不进入后续里程碑：

- Electron / Chromium 外壳以及 Electron IPC；
- 透明、无边框、置顶、最小化、关闭和托盘窗口控制；
- 拖窗、四边吸附、窗口位置与尺寸记忆、多屏和桌面工作区适配；
- Electron 安装包、代码签名、桌面自动更新与桌面进程看门狗；
- ReHoYo 全球发行工作台的 Pi 端界面副本。

正式工作台和其他 Python 项目继续作为独立客户端，通过 HTTP、WebSocket、OpenAI 兼容 Gateway 或后续发行桥接连接 Hardware Pi。GPIO、摄像头和传感器也由上层硬件项目按需扩展，不作为桌面版迁移内容。

## 后续阶段

### 第二阶段：陪伴数据

- 首次进入与授权；
- 同行偏好；
- 长期记忆；
- 共同旅行相册；
- 角色通信中心；
- 数据导出与删除。

### 第三阶段：声音

- CosyVoice 设置与连接测试；
- 流式 TTS；
- 手机端播放队列；
- HTTPS 与麦克风权限；
- 可选 STT。

### 第四阶段：发行桥接

- 消费 ReHoYo 不可变交付包；
- HTTP 推送与目录监听双入口；
- 校验值、幂等与隔离队列；
- 玩家授权、勿扰与频率策略；
- DeepSeek 发送前语义评审。

### 第五阶段：运维

- API 用量与预算；
- 审计日志；
- GitHub Actions ARM64 镜像；
- 容器更新与版本回滚；
- 局域网 HTTPS 和设备配对码。
