# 从 Electron 桌宠迁移到 Hardware Pi

Hardware Pi 是面向 Orange Pi 的无 Electron 运行时。迁移原则是直接复用 ReHoYo 已有网页层和业务逻辑，用局域网 API 替换 Electron IPC；全球发行工作台和三月七桌宠必须同时保留。

## 当前里程碑

第一阶段“不依赖 Electron 的可运行基础”已经完成：

- Python FastAPI 局域网服务；
- 手机 PWA 人物显示与文字对话；
- DeepSeek / 智谱 / CosyVoice 统一配置；
- OpenAI 兼容 Gateway；
- 本地离线回复与基础输入输出安全检查；
- SQLite 会话记录；
- Docker 与 SSH 部署。

第三个可运行版本已经加入原版工作台网页层：

- 正式版 Next.js `app`、`components` 与 `lib` 直接迁入；
- 工作台和桌宠分别通过 `3000` 与 `8000` 访问；
- 工作台生成、区域搜索和文件解析都通过 Pi 统一密钥路由；
- 不包含 ReHoYo Electron 外壳和桌宠 Electron 主进程。

第二阶段陪伴数据初步版已经完成：

- 首次进入、概念体验与模型数据流授权；
- 同行称呼、个性化、长期记忆、勿扰与暂停设置；
- SQLite 长期记忆和共同旅行相册；
- 已授权记忆注入模型上下文；
- 只展示已审核消息的角色通信中心；
- 已读、喜欢、收藏和稍后看状态；
- 不包含 API Key 的数据导出；
- 保留模型配置的同行数据删除。

第四阶段角色发行桥接已在 0.4.0 完成软件迁移：

- 工作台和 FastAPI 共享离线交付目录；
- 不可变交付包 checksum、文件名、字段安全校验；
- 幂等回执和非法交付隔离区；
- HTTP 服务令牌推送入口；
- 主动联系授权、暂停、召回、勿扰、频率与重复模板策略；
- 本地规则 + 控制面板 `companion_review` 路由的语义评审；
- 通信中心队列统计与手动检查。

第三阶段语音输出已在 0.5.0 完成软件迁移：

- 统一控制面板保存 DashScope Provider 与 CosyVoice 音色；
- 声音权利确认、启用、自动朗读、音量和语速；
- 非流式 WAV 试听；
- SSE/PCM 流式代理与手机 Web Audio 播放队列；
- 手动停止、重复播放取消和文本清洗；
- API Key 仅保存在 Pi。

正式桌面版 v4 数据导入已在 0.6.0 完成：

- 支持 `rehoyo-companion-local-data` 隐私导出；
- 支持只包含 `memories` 的记忆导出；
- 合并同行偏好、确认/显式候选记忆和已审核已发送通信；
- 隐藏自动候选、草稿通信、后台 Campaign、聊天、日志与密钥不导入；
- 基于原 ID 的稳定映射保证重复导入幂等。

Orange Pi 首次可运行与部署优化已在 0.7.0 完成：

- 默认可信局域网免鉴权，手机无需复制令牌即可连接；
- 安装阶段在终端安全写入 DeepSeek、智谱和 DashScope Key；
- GitHub Actions 发布与 Git commit 对应的 ARM64 镜像；
- Pi 默认拉取预构建镜像，失败时自动回退本地构建；
- `.dockerignore`、npm 与 pip 缓存将重复构建压缩为增量构建；
- 兼容不支持 `crypto.randomUUID()` 的旧版手机浏览器；
- Provider 测试先保存当前配置，再显示实际连接结果；
- CosyVoice 默认值直接读取正式版共享配置。

## 能力保留与替换

| 原 IPC | Hardware Pi |
| --- | --- |
| `ai:get-settings` | `GET /api/v1/control/settings` |
| `ai:save-settings` | `PUT /api/v1/control/settings` |
| `ai:test-connection` | `POST /api/v1/control/providers/:name/test` |
| `ai:chat` | `POST /api/v1/chat` / WebSocket |
| `companion:get-data` | `GET /api/v1/companion/snapshot` |
| `companion:*memory*` | `/api/v1/memories` |
| `companion:*message*` | `/api/v1/communications/:id` 与 `/api/v1/release/*` |
| `tts:*` | `/api/v1/tts/settings`、`/synthesize`、`/stream` 与 `/test` |
| `window:*` | 永久移除，由手机 PWA 和系统服务承担显示与常驻职责 |

## 永久移除

以下内容不进入后续里程碑：

- Electron / Chromium 外壳以及 Electron IPC；
- 透明、无边框、置顶、最小化、关闭和托盘窗口控制；
- 拖窗、四边吸附、窗口位置与尺寸记忆、多屏和桌面工作区适配；
- Electron 安装包、代码签名、桌面自动更新与桌面进程看门狗；

GPIO、摄像头和传感器由上层硬件项目按需扩展，不作为网页迁移的必需内容。

## 后续阶段

### 第二阶段：陪伴数据

- [x] 首次进入与授权；
- [x] 同行偏好；
- [x] 长期记忆；
- [x] 共同旅行相册；
- [x] 角色通信中心；
- [x] 数据导出与删除；
- [x] 正式桌面版 v4 数据导入和兼容测试；
- [ ] 在 Orange Pi ARM64 真机完成浏览器、重启和存储验证。

### 第三阶段：声音

- [x] CosyVoice 设置与连接测试；
- [x] 流式 TTS；
- [x] 手机端播放队列；
- [ ] 局域网 HTTPS 与麦克风权限；
- [ ] 可选 STT。

### 第四阶段：发行桥接

- [x] 消费 ReHoYo 不可变交付包；
- [x] HTTP 推送与目录监听双入口；
- [x] 校验值、幂等与隔离队列；
- [x] 玩家授权、勿扰与频率策略；
- [x] 统一控制面板路由的发送前语义评审；
- [ ] Orange Pi 真机断电恢复与长时间运行验证。

### 第五阶段：运维

- API 用量与预算；
- 审计日志；
- GitHub Actions ARM64 镜像；
- 容器更新与版本回滚；
- 局域网 HTTPS 和设备配对码。
