from __future__ import annotations

import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any

from fastapi import (
    Depends,
    FastAPI,
    HTTPException,
    Request,
    WebSocket,
    WebSocketDisconnect,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .chat_service import ChatService
from .conversations import ConversationStore
from .models import (
    ChatRequest,
    ChatResponse,
    ProviderName,
    ProviderTestResponse,
    SettingsPatch,
)
from .provider import OpenAICompatibleProvider, ProviderError
from .runtime import runtime
from .security import (
    authorize_websocket,
    require_admin,
    require_device,
    require_service,
)
from .settings_store import SettingsStore


settings_store = SettingsStore(runtime.data_dir)
conversation_store = ConversationStore(runtime.data_dir)
chat_service = ChatService(settings_store, conversation_store)


@asynccontextmanager
async def lifespan(_: FastAPI):
    runtime.data_dir.mkdir(parents=True, exist_ok=True)
    settings_store.load()
    conversation_store.initialize()
    yield


app = FastAPI(
    title="ReHoYo Hardware Pi Control Plane",
    version="0.1.0",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(ProviderError)
async def provider_error_handler(_: Request, error: ProviderError):
    return JSONResponse(
        status_code=error.status_code,
        content={"error": "PROVIDER_ERROR", "message": str(error)},
    )


@app.get("/api/v1/health")
async def health():
    settings = settings_store.public_view()
    return {
        "status": "ok",
        "service": "hardware-pi",
        "version": app.version,
        "providers": {
            name: {
                "configured": settings[name]["configured"],
                "enabled": settings[name]["enabled"],
                "model": settings[name]["model"],
            }
            for name in ("deepseek", "zhipu", "cosyvoice")
        },
    }


@app.get("/api/v1/control/settings")
async def get_settings(_: None = Depends(require_admin)):
    return settings_store.public_view()


@app.put("/api/v1/control/settings")
async def update_settings(
    patch: SettingsPatch,
    _: None = Depends(require_admin),
):
    settings_store.patch(patch)
    return settings_store.public_view()


@app.post(
    "/api/v1/control/providers/{provider_name}/test",
    response_model=ProviderTestResponse,
)
async def test_provider(
    provider_name: ProviderName,
    _: None = Depends(require_admin),
):
    if provider_name == "cosyvoice":
        raise HTTPException(
            status_code=501,
            detail="CosyVoice 测试将在语音迁移阶段启用。",
        )
    provider_settings = settings_store.provider(provider_name)
    provider = OpenAICompatibleProvider(provider_settings)
    started = time.monotonic()
    latency_ms, message = await provider.test()
    return ProviderTestResponse(
        provider=provider_name,
        configured=bool(provider_settings.api_key),
        ok=True,
        model=provider_settings.model,
        latency_ms=latency_ms
        or round((time.monotonic() - started) * 1_000),
        message=message,
    )


@app.post("/api/v1/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    _: None = Depends(require_device),
):
    return await chat_service.respond(request)


@app.get("/api/v1/conversations/{session_id}")
async def conversation_history(
    session_id: str,
    _: None = Depends(require_device),
):
    return {
        "sessionId": session_id,
        "messages": conversation_store.recent(session_id),
    }


@app.websocket("/api/v1/chat/ws")
async def chat_socket(websocket: WebSocket):
    if not await authorize_websocket(websocket):
        return
    await websocket.accept()
    try:
        while True:
            payload = await websocket.receive_json()
            request = ChatRequest.model_validate(payload)
            await websocket.send_json(
                {
                    "type": "assistant.start",
                    "sessionId": request.session_id,
                }
            )
            response = await chat_service.respond(request)
            await websocket.send_json(
                {
                    "type": "character.expression",
                    "sessionId": request.session_id,
                    "payload": {"name": response.expression},
                }
            )
            await websocket.send_json(
                {
                    "type": "assistant.final",
                    "sessionId": request.session_id,
                    "payload": response.model_dump(),
                }
            )
    except WebSocketDisconnect:
        return
    except Exception as error:
        await websocket.send_json(
            {
                "type": "error",
                "payload": {"message": str(error)[:300]},
            }
        )
        await websocket.close(code=1011)


@app.post("/api/openai/v1/chat/completions")
async def openai_compatible_proxy(
    body: dict[str, Any],
    _: None = Depends(require_service),
):
    configured = settings_store.load()
    provider_name = configured.routing.workbench_generation
    provider_settings = getattr(configured, provider_name)
    provider = OpenAICompatibleProvider(provider_settings)
    result = await provider.request(body)
    result.pop("_gateway", None)
    return result


web_dist = Path(__file__).resolve().parents[2] / "web" / "dist"
if web_dist.exists():
    app.mount(
        "/",
        StaticFiles(directory=web_dist, html=True),
        name="web",
    )
