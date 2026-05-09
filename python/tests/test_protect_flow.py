from __future__ import annotations

from typing import Any, Dict, Mapping, Optional

import pytest

from proofmark_showad import (
    AccessPolicyOptions,
    CrawlerPolicy,
    HttpClient,
    HttpResponse,
    ProtectAction,
    ProtectInput,
    ShowAdConfig,
    cookie_name,
    protect,
    protect_async,
)
from tests._helpers import make_jwt, make_valid_token


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


@pytest.fixture
def config() -> ShowAdConfig:
    return ShowAdConfig(
        creator_hash="creator-x",
        api_key="api-key-x",
        redirect_secret="redirect-secret-x",
        api_base_url="https://ad.test",
        video_ad_url="https://showad.test",
        protected_paths=("/premium/*",),
    )


def _build_input(config, **overrides) -> ProtectInput:
    base = dict(
        config=config,
        method="GET",
        full_url="https://example.com/premium/article",
        pathname="/premium/article",
        query_params={},
        cookies={},
        headers={},
        is_secure=True,
    )
    base.update(overrides)
    return ProtectInput(**base)


def test_redirect_when_no_token_no_ticket(config):
    inp = _build_input(config)
    out = protect(inp)
    assert out.is_redirect
    assert out.redirect_url is not None
    assert out.redirect_url.startswith("https://showad.test/c/creator-x")
    assert "return_url=" in out.redirect_url
    assert "sdk=1" in out.redirect_url
    assert any(spec.name == cookie_name("showad", "token") for spec in out.cookies_to_clear)


def test_excluded_path_passes_through(config):
    excluded_config = config.with_overrides(excluded_paths=("/premium/article",))
    inp = _build_input(excluded_config)
    out = protect(inp)
    assert out.action == ProtectAction.CONTINUE
    assert out.cookies_to_set == []


def test_unprotected_path_is_skipped(config):
    inp = _build_input(config, full_url="https://example.com/public/post", pathname="/public/post")
    out = protect(inp)
    assert out.action == ProtectAction.CONTINUE


def test_valid_token_continues_without_refresh(config):
    token = make_valid_token("creator-x", fingerprint="fp1")
    fake = FakeHttpClient(body={"valid": True, "message": "ok", "creator_hash": "creator-x"})
    cookies = {
        cookie_name("showad", "fingerprint"): "fp1",
        cookie_name("showad", "token"): token,
        cookie_name("showad", "creator"): "creator-x",
        cookie_name("showad", "verified"): "1",
    }
    from proofmark_showad.jwt_helper import get_token_expiry

    cookies[cookie_name("showad", "expires")] = str(get_token_expiry(token))
    inp = _build_input(config, cookies=cookies, http_client=fake)
    out = protect(inp)
    assert out.action == ProtectAction.CONTINUE
    assert out.cookies_to_set == []
    assert len(fake.calls) == 1
    assert fake.calls[0]["url"].endswith("/api/sdk/validate")
    assert fake.calls[0]["json_body"] == {"token": token, "sdk_key": "api-key-x"}


def test_valid_token_refreshes_cookies_when_metadata_missing(config):
    token = make_valid_token("creator-x", fingerprint="fp1")
    fake = FakeHttpClient(body={"valid": True, "message": "ok", "creator_hash": "creator-x"})
    cookies = {
        cookie_name("showad", "fingerprint"): "fp1",
        cookie_name("showad", "token"): token,
    }
    inp = _build_input(config, cookies=cookies, http_client=fake)
    out = protect(inp)
    assert out.action == ProtectAction.CONTINUE
    set_names = {spec.name for spec in out.cookies_to_set}
    assert cookie_name("showad", "verified") in set_names
    assert cookie_name("showad", "creator") in set_names
    assert cookie_name("showad", "expires") in set_names
    token_spec = next(s for s in out.cookies_to_set if s.name == cookie_name("showad", "token"))
    assert token_spec.http_only is True


def test_forged_token_with_matching_claims_redirects_when_backend_rejects(config):
    token = make_valid_token("creator-x", fingerprint="fp1")
    fake = FakeHttpClient(body={"valid": False, "message": "forged"})
    cookies = {
        cookie_name("showad", "fingerprint"): "fp1",
        cookie_name("showad", "token"): token,
        cookie_name("showad", "creator"): "creator-x",
        cookie_name("showad", "verified"): "1",
    }
    from proofmark_showad.jwt_helper import get_token_expiry

    cookies[cookie_name("showad", "expires")] = str(get_token_expiry(token))
    inp = _build_input(config, cookies=cookies, http_client=fake)
    out = protect(inp)
    assert out.is_redirect
    assert out.reason == "invalid_token"
    assert any(spec.name == cookie_name("showad", "token") for spec in out.cookies_to_clear)


def test_expired_token_redirects(config):
    expired = make_jwt({"creator_hash": "creator-x", "exp": 0})
    cookies = {
        cookie_name("showad", "fingerprint"): "fp1",
        cookie_name("showad", "token"): expired,
    }
    failures = []
    inp = _build_input(
        config, cookies=cookies, on_verification_failed=failures.append
    )
    out = protect(inp)
    assert out.is_redirect
    assert "expired_token" in failures


def test_token_creator_mismatch_redirects(config):
    token = make_valid_token("other-creator", fingerprint="fp1")
    cookies = {
        cookie_name("showad", "fingerprint"): "fp1",
        cookie_name("showad", "token"): token,
    }
    inp = _build_input(config, cookies=cookies)
    out = protect(inp)
    assert out.is_redirect


def test_redirect_ticket_claim_success_sets_cookies_and_redirects(config):
    token = make_valid_token("creator-x", fingerprint="fp1")
    fake = FakeHttpClient(body={
        "token": token,
        "creator_hash": "creator-x",
        "ticket_id": "ticket-123",
    })
    cookies = {cookie_name("showad", "fingerprint"): "fp1"}
    inp = _build_input(
        config,
        cookies=cookies,
        full_url="https://example.com/premium/article?redirect_ticket=ticket-123&utm=x",
        query_params={"redirect_ticket": "ticket-123", "utm": "x"},
        http_client=fake,
    )
    out = protect(inp)
    assert out.is_redirect
    assert out.redirect_url is not None
    assert "redirect_ticket" not in out.redirect_url
    assert "utm=x" in out.redirect_url

    set_names = {spec.name for spec in out.cookies_to_set}
    assert cookie_name("showad", "token") in set_names
    assert cookie_name("showad", "ticket") in set_names
    assert cookie_name("showad", "verified") in set_names

    assert len(fake.calls) == 1
    call = fake.calls[0]
    assert call["url"].endswith("/api/redirect-ticket/ticket-123/claim")
    assert call["headers"]["X-Redirect-Ticket-Secret"] == "redirect-secret-x"
    assert call["headers"]["X-ShowAd-API-Key"] == "api-key-x"
    assert call["headers"]["X-ShowAd-Creator-Hash"] == "creator-x"
    assert call["json_body"] == {"creator_hash": "creator-x"}


def test_redirect_ticket_creator_mismatch_redirects_to_video(config):
    token = make_valid_token("creator-x", fingerprint="fp1")
    fake = FakeHttpClient(body={
        "token": token,
        "creator_hash": "different-creator",
        "ticket_id": "ticket-123",
    })
    cookies = {cookie_name("showad", "fingerprint"): "fp1"}
    inp = _build_input(
        config,
        cookies=cookies,
        full_url="https://example.com/premium/article?redirect_ticket=ticket-123",
        query_params={"redirect_ticket": "ticket-123"},
        http_client=fake,
    )
    out = protect(inp)
    assert out.is_redirect
    assert out.redirect_url is not None
    assert out.redirect_url.startswith("https://showad.test/c/creator-x")


def test_redirect_ticket_claim_410_redirects_to_video(config):
    fake = FakeHttpClient(status=410, body={"error": "ticket gone"})
    cookies = {cookie_name("showad", "fingerprint"): "fp1"}
    inp = _build_input(
        config,
        cookies=cookies,
        full_url="https://example.com/premium/article?redirect_ticket=t1",
        query_params={"redirect_ticket": "t1"},
        http_client=fake,
    )
    out = protect(inp)
    assert out.is_redirect
    assert out.redirect_url is not None
    assert out.redirect_url.startswith("https://showad.test/c/creator-x")


def test_redirect_ticket_without_fingerprint_redirects(config):
    fake = FakeHttpClient()
    inp = _build_input(
        config,
        full_url="https://example.com/premium/article?redirect_ticket=t1",
        query_params={"redirect_ticket": "t1"},
        http_client=fake,
    )
    out = protect(inp)
    assert out.is_redirect
    assert fake.calls == []


def test_access_policy_allow_short_circuits(config):
    fake = FakeHttpClient()
    inp = _build_input(
        config,
        headers={"x-premium": "1"},
        access_policy=AccessPolicyOptions(
            before_protect=lambda req: {"action": "allow", "reason": "premium"}
        ),
        http_client=fake,
    )
    out = protect(inp)
    assert out.action == ProtectAction.CONTINUE
    assert fake.calls == []


def test_access_policy_verified_googlebot_allowed(config):
    inp = _build_input(
        config,
        headers={"user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
        remote_addr="66.249.66.1",
        access_policy=AccessPolicyOptions(
            crawler=CrawlerPolicy(
                enabled=True,
                families=("google",),
                family_cidrs={"google": ("66.249.64.0/19",)},
            ),
        ),
    )
    out = protect(inp)
    assert out.action == ProtectAction.CONTINUE
    assert out.reason and out.reason.startswith("crawler:google")


def test_access_policy_fake_googlebot_denied_and_redirected(config):
    fake = FakeHttpClient()
    inp = _build_input(
        config,
        headers={"user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)"},
        remote_addr="198.51.100.5",
        http_client=fake,
        access_policy=AccessPolicyOptions(
            crawler=CrawlerPolicy(
                enabled=True,
                families=("google",),
                family_cidrs={"google": ("66.249.64.0/19",)},
            ),
        ),
    )
    out = protect(inp)
    assert out.is_redirect
    assert fake.calls == []


@pytest.mark.asyncio
async def test_protect_async_basic_redirect(config):
    inp = _build_input(config)
    out = await protect_async(inp)
    assert out.is_redirect
