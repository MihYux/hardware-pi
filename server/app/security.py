from __future__ import annotations

import hmac

from fastapi import Header, HTTPException, WebSocket, status

from .runtime import runtime


def _matches(candidate: str, expected: str) -> bool:
    return bool(expected) and hmac.compare_digest(candidate, expected)


def require_admin(
    x_admin_token: str = Header(default="", alias="X-Admin-Token"),
) -> None:
    if not runtime.auth_required:
        return
    if not _matches(x_admin_token, runtime.admin_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="管理令牌无效。",
        )


def require_device(
    authorization: str = Header(default=""),
) -> None:
    if not runtime.auth_required:
        return
    token = authorization.removeprefix("Bearer ").strip()
    if not _matches(token, runtime.device_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="设备令牌无效。",
        )


def require_service(
    authorization: str = Header(default=""),
) -> None:
    if not runtime.auth_required:
        return
    token = authorization.removeprefix("Bearer ").strip()
    if not _matches(token, runtime.service_token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="服务令牌无效。",
        )


async def authorize_websocket(websocket: WebSocket) -> bool:
    if not runtime.auth_required:
        return True
    token = websocket.query_params.get("token", "")
    if _matches(token, runtime.device_token):
        return True
    await websocket.close(code=4401, reason="设备令牌无效")
    return False
