from __future__ import annotations

import asyncio
import json
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any
from urllib.parse import quote

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
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from .chat_service import ChatService
from .companion_store import CompanionStore
from .conversations import ConversationStore
from .models import (
    ChatRequest,
    ChatResponse,
    CommunicationPatch,
    CompanionProfilePatch,
    MemoryCreate,
    MemoryPatch,
    OnboardingRequest,
    ProviderName,
    ProviderTestResponse,
    SettingsPatch,
    TtsRequest,
)
from .provider import OpenAICompatibleProvider, ProviderError
from .release_bridge import (
    ReleaseBridgeConsumer,
    validate_delivery_envelope,
)
from .release_service import ReleaseService
from .runtime import runtime
from .security import (
    authorize_websocket,
    require_admin,
    require_device,
    require_service,
)
from .settings_store import SettingsStore
from .tts_service import TtsError, TtsService


settings_store = SettingsStore(runtime.data_dir)
conversation_store = ConversationStore(runtime.data_dir)
companion_store = CompanionStore(runtime.data_dir)
chat_service = ChatService(
    settings_store,
    conversation_store,
    companion_store,
)
release_bridge: ReleaseBridgeConsumer | None = None
release_service: ReleaseService | None = None
tts_service: TtsService | None = None


async def release_worker(stop: asyncio.Event) -> None:
    while not stop.is_set():
        try:
            if release_bridge:
                await asyncio.to_thread(release_bridge.scan)
            if release_service:
                await release_service.process_pending()
        except Exception:
            # A bad delivery is isolated by the bridge. Provider/network
            # failures must never stop the API or the next queue pass.
            pass
        try:
            await asyncio.wait_for(stop.wait(), timeout=5)
        except TimeoutError:
            continue


@asynccontextmanager
async def lifespan(_: FastAPI):
    global release_bridge, release_service, tts_service
    runtime.data_dir.mkdir(parents=True, exist_ok=True)
    settings_store.load()
    conversation_store.initialize()
    companion_store.initialize()
    release_service = ReleaseService(companion_store, settings_store)
    tts_service = TtsService(settings_store)
    release_bridge = ReleaseBridgeConsumer(
        runtime.bridge_dir,
        companion_store.queue_release_delivery,
    )
    release_bridge.initialize()
    stop = asyncio.Event()
    worker = asyncio.create_task(release_worker(stop))
    try:
        yield
    finally:
        stop.set()
        worker.cancel()
        try:
            await worker
        except asyncio.CancelledError:
            pass


app = FastAPI(
    title="ReHoYo Hardware Pi Control Plane",
    version="0.8.1",
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


@app.exception_handler(TtsError)
async def tts_error_handler(_: Request, error: TtsError):
    return JSONResponse(
        status_code=error.status_code,
        content={
            "error": error.code,
            "message": str(error),
        },
    )


@app.exception_handler(ValueError)
async def value_error_handler(_: Request, error: ValueError):
    return JSONResponse(
        status_code=400,
        content={"error": "INVALID_COMPANION_DATA", "message": str(error)},
    )


@app.get("/api/v1/health")
async def health():
    settings = settings_store.public_view()
    return {
        "status": "ok",
        "service": "hardware-pi",
        "version": app.version,
        "authentication": {
            "mode": runtime.auth_mode,
            "required": runtime.auth_required,
        },
        "modules": {
            "companion": {"port": runtime.port},
            "workbench": {"port": runtime.workbench_port},
        },
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
        if not tts_service:
            raise HTTPException(status_code=503, detail="语音服务尚未启动。")
        started = time.monotonic()
        result = await tts_service.synthesize(
            "嗨，开拓者！三月七的语音已经准备好啦！",
            require_enabled=False,
        )
        return ProviderTestResponse(
            provider=provider_name,
            configured=True,
            ok=True,
            model=result.model,
            latency_ms=round((time.monotonic() - started) * 1_000),
            message=f"连接成功 · {result.characters} 字",
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


@app.get("/api/v1/companion/snapshot")
async def companion_snapshot(_: None = Depends(require_device)):
    return companion_store.snapshot()


@app.post("/api/v1/companion/onboarding")
async def complete_onboarding(
    request: OnboardingRequest,
    _: None = Depends(require_device),
):
    companion_store.onboard(request)
    if release_service:
        await release_service.process_pending(force=True)
    return companion_store.snapshot()


@app.put("/api/v1/companion/profile")
async def update_companion_profile(
    patch: CompanionProfilePatch,
    _: None = Depends(require_device),
):
    companion_store.update_profile(patch)
    if release_service:
        await release_service.process_pending(force=True)
    return companion_store.profile()


@app.get("/api/v1/companion/export")
async def export_companion_data(_: None = Depends(require_device)):
    return companion_store.export_data()


@app.delete("/api/v1/companion/data")
async def delete_companion_data(_: None = Depends(require_device)):
    return companion_store.delete_all()


@app.post("/api/v1/companion/import")
async def import_companion_data(
    request: Request,
    _: None = Depends(require_device),
):
    raw = await request.body()
    if len(raw) > 8 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="导入文件不能超过 8 MB。")
    try:
        body = json.loads(raw)
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise ValueError("导入文件不是有效的 JSON。") from error
    if (
        not isinstance(body, dict)
        or body.get("accepted_data_import") is not True
    ):
        raise ValueError("导入前必须确认数据合并说明。")
    payload = body.get("payload")
    if not isinstance(payload, dict):
        raise ValueError("导入请求缺少正式版导出数据。")
    return companion_store.import_v4(payload)


@app.post("/api/v1/memories", status_code=201)
async def create_memory(
    request: MemoryCreate,
    _: None = Depends(require_device),
):
    return companion_store.create_memory(request)


@app.patch("/api/v1/memories/{memory_id}")
async def update_memory(
    memory_id: str,
    patch: MemoryPatch,
    _: None = Depends(require_device),
):
    memory = companion_store.update_memory(memory_id, patch)
    if not memory:
        raise HTTPException(status_code=404, detail="没有找到这条记忆。")
    return memory


@app.delete("/api/v1/memories/{memory_id}", status_code=204)
async def delete_memory(
    memory_id: str,
    _: None = Depends(require_device),
):
    if not companion_store.delete_memory(memory_id):
        raise HTTPException(status_code=404, detail="没有找到这条记忆。")


@app.patch("/api/v1/communications/{message_id}")
async def update_communication(
    message_id: str,
    patch: CommunicationPatch,
    _: None = Depends(require_device),
):
    message = companion_store.update_communication(message_id, patch)
    if not message:
        raise HTTPException(status_code=404, detail="没有找到这条通信。")
    return message


@app.get("/api/v1/tts/settings")
async def get_tts_settings(_: None = Depends(require_device)):
    if not tts_service:
        raise HTTPException(status_code=503, detail="语音服务尚未启动。")
    return tts_service.public_settings()


@app.post("/api/v1/tts/synthesize")
async def synthesize_speech(
    request: TtsRequest,
    _: None = Depends(require_device),
):
    if not tts_service:
        raise HTTPException(status_code=503, detail="语音服务尚未启动。")
    result = await tts_service.synthesize(
        request.text,
        mood=request.mood,
    )
    return Response(
        content=result.audio,
        media_type=result.mime_type,
        headers={
            "X-TTS-Characters": str(result.characters),
            "X-TTS-Model": result.model,
            "Cache-Control": "no-store",
        },
    )


@app.post("/api/v1/tts/stream")
async def stream_speech(
    request: TtsRequest,
    _: None = Depends(require_device),
):
    if not tts_service:
        raise HTTPException(status_code=503, detail="语音服务尚未启动。")
    return StreamingResponse(
        tts_service.stream_events(request.text, mood=request.mood),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-store",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/api/v1/tts/test")
async def test_speech(_: None = Depends(require_admin)):
    if not tts_service:
        raise HTTPException(status_code=503, detail="语音服务尚未启动。")
    result = await tts_service.synthesize(
        "嗨，开拓者！三月七的语音已经准备好啦！",
        require_enabled=False,
    )
    return Response(
        content=result.audio,
        media_type=result.mime_type,
        headers={
            "X-TTS-Characters": str(result.characters),
            "X-TTS-Model": result.model,
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/v1/release/status")
async def release_status(_: None = Depends(require_admin)):
    return {
        "bridge": release_bridge.status() if release_bridge else {},
        "deliveries": companion_store.release_status(),
    }


@app.post("/api/v1/release/scan")
async def scan_release_queue(_: None = Depends(require_admin)):
    bridge_result = (
        await asyncio.to_thread(release_bridge.scan)
        if release_bridge
        else {}
    )
    delivery_result = (
        await release_service.process_pending(force=True)
        if release_service
        else {}
    )
    return {
        "bridge": bridge_result,
        "processing": delivery_result,
        "deliveries": companion_store.release_status(),
    }


@app.post("/api/v1/release/deliveries", status_code=202)
async def push_release_delivery(
    body: dict[str, Any],
    _: None = Depends(require_service),
):
    delivery, checksum = validate_delivery_envelope(body)
    queued = companion_store.queue_release_delivery(delivery, checksum)
    processing = (
        await release_service.process_pending(force=True)
        if release_service
        else {}
    )
    return {
        "delivery_id": delivery["deliveryId"],
        "queue": queued,
        "processing": processing,
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


def workbench_zhipu_provider() -> OpenAICompatibleProvider:
    configured = settings_store.load()
    provider_name = configured.routing.region_search
    return OpenAICompatibleProvider(getattr(configured, provider_name))


@app.post("/api/zhipu/v1/web_search")
async def workbench_web_search_proxy(
    body: dict[str, Any],
    _: None = Depends(require_service),
):
    return await workbench_zhipu_provider().passthrough(
        "web_search",
        body=body,
    )


@app.post("/api/zhipu/v1/files/parser/create")
async def workbench_file_parse_proxy(
    request: Request,
    _: None = Depends(require_service),
):
    return await workbench_zhipu_provider().passthrough(
        "files/parser/create",
        content=await request.body(),
        content_type=request.headers.get("content-type", ""),
    )


@app.get("/api/zhipu/v1/files/parser/result/{task_id}/text")
async def workbench_file_parse_result_proxy(
    task_id: str,
    _: None = Depends(require_service),
):
    return await workbench_zhipu_provider().passthrough(
        f"files/parser/result/{quote(task_id, safe='')}/text",
        method="GET",
    )


web_dist = Path(__file__).resolve().parents[2] / "web" / "dist"
if web_dist.exists():
    app.mount(
        "/",
        StaticFiles(directory=web_dist, html=True),
        name="web",
    )
