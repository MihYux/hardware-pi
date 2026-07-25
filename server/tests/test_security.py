from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app import security


def test_lan_mode_accepts_requests_without_tokens(monkeypatch):
    monkeypatch.setattr(
        security,
        "runtime",
        SimpleNamespace(auth_required=False),
    )

    assert security.require_admin("") is None
    assert security.require_device("") is None
    assert security.require_service("") is None


def test_token_mode_still_rejects_invalid_tokens(monkeypatch):
    monkeypatch.setattr(
        security,
        "runtime",
        SimpleNamespace(
            auth_required=True,
            admin_token="admin-token",
            device_token="device-token",
            service_token="service-token",
        ),
    )

    with pytest.raises(HTTPException) as error:
        security.require_device("Bearer wrong-token")
    assert error.value.status_code == 401
