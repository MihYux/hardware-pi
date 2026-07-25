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
