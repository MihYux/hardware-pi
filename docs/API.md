# Hardware Pi API

所有接口默认与手机页面同源。生产环境必须配置三个不同的长随机令牌：

- `HARDWARE_PI_ADMIN_TOKEN`：修改 Provider 和路由。
- `HARDWARE_PI_DEVICE_TOKEN`：手机对话与读取会话。
- `HARDWARE_PI_SERVICE_TOKEN`：ReHoYo 工作台和大型项目调用 Gateway。

## 健康检查

```http
GET /api/v1/health
```

不需要令牌，只返回 Provider 是否配置，不返回密钥。

## 控制面板

```http
GET /api/v1/control/settings
X-Admin-Token: <admin-token>
```

```http
PUT /api/v1/control/settings
X-Admin-Token: <admin-token>
Content-Type: application/json

{
  "providers": {
    "deepseek": {
      "enabled": true,
      "base_url": "https://api.deepseek.com",
      "model": "deepseek-chat",
      "api_key": "..."
    }
  },
  "routing": {
    "workbench_generation": "deepseek",
    "companion_chat": "deepseek"
  }
}
```

`api_key` 留空或省略时保留现有密钥。设置 `clear_api_key: true` 才会清除。

## 手机对话

```http
POST /api/v1/chat
Authorization: Bearer <device-token>
Content-Type: application/json

{
  "session_id": "phone-01",
  "message": "今天去哪里拍照？",
  "history": []
}
```

实时事件入口：

```text
WS /api/v1/chat/ws?token=<device-token>
```

发送与 HTTP 相同的请求对象。服务端依次发送：

- `assistant.start`
- `character.expression`
- `assistant.final`

已完成首次进入且开启个性化时，服务端会把玩家称呼加入角色上下文；只有同时满足“长期记忆已开启”“玩家已确认”“允许角色引用”的记忆才会加入模型上下文。暂停同行会立即停止个性化和记忆引用。

## 陪伴快照与首次进入

以下接口都使用设备令牌：

```http
GET /api/v1/companion/snapshot
Authorization: Bearer <device-token>
```

返回同行资料、记忆、已审核通信和数量统计。新设备的 `profile.onboarding_completed` 为 `false`。

```http
POST /api/v1/companion/onboarding
Authorization: Bearer <device-token>
Content-Type: application/json

{
  "display_name": "开拓者",
  "region": "china",
  "language": "zh-CN",
  "time_zone": "Asia/Shanghai",
  "allowed_content_types": ["daily", "photo", "postcard", "relationship"],
  "proactive_contact_enabled": false,
  "recall_enabled": false,
  "personalization_enabled": true,
  "memory_enabled": true,
  "quiet_hours": {"start": "22:00", "end": "09:00"},
  "weekly_contact_limit": 2,
  "accepted_concept": true,
  "accepted_data_flow": true,
  "first_join_choice": "take_photos",
  "consent_version": "hardware-pi-v1"
}
```

`first_join_choice` 可选值：

- `take_photos`
- `explore_places`
- `hear_stories`
- `walk_slowly`

完成后会创建一封欢迎通信；开启长期记忆并选择第一次同行时，还会创建一条玩家确认的共同记忆。重复提交不会重复创建这两条记录。

## 同行设置

```http
PUT /api/v1/companion/profile
Authorization: Bearer <device-token>
Content-Type: application/json

{
  "display_name": "开拓者",
  "memory_enabled": true,
  "personalization_enabled": true,
  "proactive_contact_enabled": false,
  "quiet_hours": {"start": "22:00", "end": "09:00"},
  "weekly_contact_limit": 2,
  "paused": false
}
```

所有字段都可选。关闭长期记忆不会删除现有记录，只会停止模型引用；`paused: true` 会停止全部个性化上下文。

## 长期记忆与相册

创建玩家明确确认的共同记忆：

```http
POST /api/v1/memories
Authorization: Bearer <device-token>
Content-Type: application/json

{
  "type": "photo",
  "title": "Pi 上的第一天",
  "summary": "第一次通过手机看到三月七。",
  "reusable_by_character": true,
  "user_confirmed": true
}
```

修改或关闭引用：

```http
PATCH /api/v1/memories/<memory-id>
Authorization: Bearer <device-token>
Content-Type: application/json

{"reusable_by_character": false}
```

删除：

```http
DELETE /api/v1/memories/<memory-id>
Authorization: Bearer <device-token>
```

## 角色通信

当前阶段由首次进入流程创建一封已审核欢迎通信。ReHoYo 发行消息写入、校验和隔离队列将在发行桥接阶段开放；当前 API 不允许手机自行创建通信。

```http
PATCH /api/v1/communications/<message-id>
Authorization: Bearer <device-token>
Content-Type: application/json

{
  "read": true,
  "favorite": true,
  "liked": true,
  "remind_later": false
}
```

通信中心只返回 `review_status=approved` 且已经发送的消息。

## 导出与删除

```http
GET /api/v1/companion/export
Authorization: Bearer <device-token>
```

导出资料、记忆和通信，不包含 API Key 和自由聊天记录。

```http
DELETE /api/v1/companion/data
Authorization: Bearer <device-token>
```

删除同行资料、记忆和通信，并回到首次进入状态。统一 Provider 配置、API Key 和访问令牌不会被删除。

## OpenAI 兼容入口

```http
POST /api/openai/v1/chat/completions
Authorization: Bearer <service-token>
```

请求和响应保持 OpenAI Chat Completions 结构。实际 Base URL、API Key 与模型由控制面板决定。

ReHoYo 可以这样配置：

```env
AI_PROVIDER=deepseek
DEEPSEEK_API_KEY=<HARDWARE_PI_SERVICE_TOKEN>
DEEPSEEK_BASE_URL=http://orange-pi.local:8000/api/openai/v1
```

此时 ReHoYo 不再持有真实 DeepSeek Key。
