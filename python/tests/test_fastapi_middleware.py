from __future__ import annotations

from typing import Any, Dict, Optional

import pytest

from proofmark_showad import (
    AsyncHttpClient,
    HttpClient,
    HttpResponse,
    ShowAdConfig,
    cookie_name,
)
from proofmark_showad.fastapi import ShowAdMiddleware
from tests._helpers import make_valid_token


class FakeAsyncHttpClient(AsyncHttpClient):
    def __init__(self, *, status: int = 200, body: Optional[Dict[str, Any]] = None):
        self.status = status
        self.body = body or {}
        self.calls = []

    async def request(self, method, url, *, headers=None, json_body=None, timeout=10.0) -> HttpResponse:
        import json as _json

        self.calls.append({
            "method": method,
            "url": url,
            "headers": dict(headers or {}),
            "json_body": dict(json_body or {}),
        })
        return HttpResponse(
            status=self.status,
            body=_json.dumps(self.body).encode("utf-8"),
            headers={"content-type": "application/json"},
        )


def _make_app(config: ShowAdConfig, *, async_client=None):
    from fastapi import FastAPI

    app = FastAPI()
    app.add_middleware(
        ShowAdMiddleware,
        config=config,
        async_http_client=async_client,
    )

    @app.get("/public/article")
    def public():
        return {"ok": True}

    @app.get("/premium/article")
    def premium():
        return {"ok": True, "premium": True}

    return app


@pytest.fixture
def config() -> ShowAdConfig:
    return ShowAdConfig(
        creator_hash="creator-fastapi",
        api_key="api-key-fastapi",
        redirect_secret="redirect-secret-fastapi",
        api_base_url="https://ad.test",
        video_ad_url="https://showad.test",
        protected_paths=("/premium/*",),
    )


@pytest.fixture
def httpx_client(config):
    import httpx

    return httpx.AsyncClient(transport=httpx.ASGITransport(app=_make_app(config)), base_url="https://example.com")


@pytest.mark.asyncio
async def test_public_path_passes_through(config):
    import httpx

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app(config)),
        base_url="https://example.com",
    ) as client:
        resp = await client.get("/public/article")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_protected_path_without_token_redirects(config):
    import httpx

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app(config)),
        base_url="https://example.com",
    ) as client:
        resp = await client.get("/premium/article", follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"].startswith("https://showad.test/c/creator-fastapi")


@pytest.mark.asyncio
async def test_protected_path_with_valid_token_passes_through(config):
    import httpx

    token = make_valid_token("creator-fastapi", fingerprint="fp1")
    fake = FakeAsyncHttpClient(body={"valid": True, "message": "ok", "creator_hash": "creator-fastapi"})
    from proofmark_showad.jwt_helper import get_token_expiry

    cookies = {
        cookie_name("showad", "token"): token,
        cookie_name("showad", "fingerprint"): "fp1",
        cookie_name("showad", "creator"): "creator-fastapi",
        cookie_name("showad", "verified"): "1",
        cookie_name("showad", "expires"): str(get_token_expiry(token)),
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app(config, async_client=fake)),
        base_url="https://example.com",
        cookies=cookies,
    ) as client:
        resp = await client.get("/premium/article", follow_redirects=False)
    assert resp.status_code == 200
    body = resp.json()
    assert body["premium"] is True
    assert len(fake.calls) == 1
    assert fake.calls[0]["url"].endswith("/api/sdk/validate")
    assert fake.calls[0]["json_body"] == {"token": token, "sdk_key": "api-key-fastapi"}


@pytest.mark.asyncio
async def test_forged_token_redirects_when_async_backend_rejects(config):
    import httpx

    token = make_valid_token("creator-fastapi", fingerprint="fp1")
    fake = FakeAsyncHttpClient(body={"valid": False, "message": "forged"})
    cookies = {
        cookie_name("showad", "token"): token,
        cookie_name("showad", "fingerprint"): "fp1",
    }

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_make_app(config, async_client=fake)),
        base_url="https://example.com",
        cookies=cookies,
    ) as client:
        resp = await client.get("/premium/article", follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"].startswith("https://showad.test/c/creator-fastapi")
    assert len(fake.calls) == 1


@pytest.mark.asyncio
async def test_redirect_ticket_claim_via_async_middleware(config):
    import httpx

    token = make_valid_token("creator-fastapi", fingerprint="fp1")
    fake = FakeAsyncHttpClient(body={
        "token": token,
        "creator_hash": "creator-fastapi",
        "ticket_id": "ticket-async",
    })

    app = _make_app(config, async_client=fake)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://example.com",
        cookies={cookie_name("showad", "fingerprint"): "fp1"},
    ) as client:
        resp = await client.get(
            "/premium/article",
            params={"redirect_ticket": "ticket-async"},
            follow_redirects=False,
        )
    assert resp.status_code == 302
    assert "redirect_ticket" not in resp.headers["location"]
    assert len(fake.calls) == 1
    assert fake.calls[0]["json_body"] == {"creator_hash": "creator-fastapi"}


@pytest.mark.asyncio
async def test_redirect_ticket_410_redirects_to_video(config):
    import httpx

    fake = FakeAsyncHttpClient(status=410, body={"error": "ticket gone"})
    app = _make_app(config, async_client=fake)
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app),
        base_url="https://example.com",
        cookies={cookie_name("showad", "fingerprint"): "fp1"},
    ) as client:
        resp = await client.get(
            "/premium/article",
            params={"redirect_ticket": "ticket-bad"},
            follow_redirects=False,
        )
    assert resp.status_code == 302
    assert resp.headers["location"].startswith("https://showad.test/c/creator-fastapi")
