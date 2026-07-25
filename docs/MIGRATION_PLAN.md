# 从 Electron 桌宠迁移到 Hardware Pi

## 当前里程碑

第一阶段目标是建立不依赖 Electron 的可运行基础：

- Python FastAPI 局域网服务；
- 手机 PWA 人物显示与文字对话；
- DeepSeek / 智谱 / CosyVoice 统一配置；
- OpenAI 兼容 Gateway；
- 本地离线回复与基础输入输出安全检查；
- SQLite 会话记录；
- Docker 与 SSH 部署。

## Electron 能力映射

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
| `window:*` | 浏览器/PWA 中移除 |

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
- 自动更新与回滚；
- 局域网 HTTPS 和设备配对码。
