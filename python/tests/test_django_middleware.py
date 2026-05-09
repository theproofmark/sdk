from __future__ import annotations

from typing import Any, Dict, Optional

from proofmark_showad import HttpClient, HttpResponse, cookie_name
from tests._helpers import make_valid_token


class FakeHttpClient(HttpClient):
    def __init__(self, *, status: int = 200, body: Optional[Dict[str, Any]] = None):
        self.status = status
        self.body = body or {}
        self.calls = []

    def request(self, method, url, *, headers=None, json_body=None, timeout=10.0) -> HttpResponse:
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


def _client():
    from django.test import Client

    return Client()


def test_public_path_passes_through():
    response = _client().get("/public/article")
    assert response.status_code == 200
    assert response.content == b"ok"


def test_protected_path_without_token_redirects_to_video_ad():
    response = _client().get("/premium/article")
    assert response.status_code == 302
    assert response["Location"].startswith("https://showad.test.proofmark.io/c/creator-test-hash")
    assert "return_url=" in response["Location"]


def test_protected_path_with_valid_token_passes_through():
    token = make_valid_token("creator-test-hash", fingerprint="fp1")
    fake = FakeHttpClient(body={"valid": True, "message": "ok", "creator_hash": "creator-test-hash"})
    from django.conf import settings

    settings.SHOWAD["http_client"] = fake
    client = _client()
    client.cookies[cookie_name("showad", "token")] = token
    client.cookies[cookie_name("showad", "fingerprint")] = "fp1"
    client.cookies[cookie_name("showad", "creator")] = "creator-test-hash"
    client.cookies[cookie_name("showad", "verified")] = "1"

    from proofmark_showad.jwt_helper import get_token_expiry

    client.cookies[cookie_name("showad", "expires")] = str(get_token_expiry(token))
    try:
        response = client.get("/premium/article")
    finally:
        settings.SHOWAD.pop("http_client", None)
    assert response.status_code == 200
    assert response.content == b"ok"
    assert len(fake.calls) == 1
    assert fake.calls[0]["url"].endswith("/api/sdk/validate")


def test_redirect_ticket_claim_via_django_middleware(monkeypatch):
    token = make_valid_token("creator-test-hash", fingerprint="fp1")
    fake = FakeHttpClient(body={
        "token": token,
        "creator_hash": "creator-test-hash",
        "ticket_id": "ticket-django",
    })

    from proofmark_showad.django import middleware as middleware_mod
    from proofmark_showad import api as api_mod

    monkeypatch.setattr(api_mod, "StdlibHttpClient", lambda: fake)

    client = _client()
    client.cookies[cookie_name("showad", "fingerprint")] = "fp1"

    response = client.get("/premium/article", {"redirect_ticket": "ticket-django"})
    assert response.status_code == 302
    assert "redirect_ticket" not in response["Location"]
    assert response["Location"].endswith("/premium/article")
    cookies = response.cookies
    assert cookie_name("showad", "token") in cookies
    assert cookies[cookie_name("showad", "token")]["httponly"]
