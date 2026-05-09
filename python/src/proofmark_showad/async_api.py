"""Async ShowAd backend API calls (httpx-backed)."""

from __future__ import annotations

from typing import Any, Dict, Optional

from .api import (
    _claim_headers,
    _health_url,
    _interpret_claim_response,
    _ticket_url,
    _validate_headers,
    _validate_url,
)
from .config import ShowAdConfig
from .exceptions import ShowAdError, ShowAdErrorCode
from .http_client import AsyncHttpClient, HttpxAsyncHttpClient


def _default_async_client() -> AsyncHttpClient:
    return HttpxAsyncHttpClient()


async def claim_redirect_ticket_async(
    config: ShowAdConfig,
    ticket_id: str,
    *,
    http: Optional[AsyncHttpClient] = None,
) -> Dict[str, Any]:
    config.validate()
    client = http or _default_async_client()
    try:
        response = await client.request(
            "POST",
            _ticket_url(config.api_base_url, ticket_id),
            headers=_claim_headers(config),
            json_body={"creator_hash": config.creator_hash},
            timeout=config.request_timeout,
        )
    except OSError as exc:
        raise ShowAdError(
            f"Failed to claim redirect ticket: {exc}",
            code=ShowAdErrorCode.NETWORK_ERROR,
            cause=exc,
        ) from exc
    return _interpret_claim_response(response)


async def validate_token_async(
    config: ShowAdConfig,
    token: str,
    *,
    http: Optional[AsyncHttpClient] = None,
) -> Dict[str, Any]:
    config.validate()
    client = http or _default_async_client()
    try:
        response = await client.request(
            "POST",
            _validate_url(config.api_base_url),
            headers=_validate_headers(config),
            json_body={"token": token, "sdk_key": config.api_key},
            timeout=config.request_timeout,
        )
    except ShowAdError:
        raise
    except Exception as exc:
        raise ShowAdError(
            f"Failed to validate token: {exc}",
            code=ShowAdErrorCode.NETWORK_ERROR,
            cause=exc,
        ) from exc

    if not (200 <= response.status < 300):
        raise ShowAdError(
            f"Token validation failed: HTTP {response.status}",
            code=ShowAdErrorCode.TOKEN_INVALID,
            details={"status": response.status, "response": response.json()},
        )

    data = response.json()
    if not isinstance(data, dict):
        raise ShowAdError(
            "Invalid token validation response from ShowAd backend",
            code=ShowAdErrorCode.TOKEN_INVALID,
            details={"status": response.status},
        )
    if not data.get("valid"):
        raise ShowAdError(
            data.get("message") or "Token is invalid",
            code=ShowAdErrorCode.TOKEN_INVALID,
            details={"response": data},
        )
    return data


async def check_health_async(
    config: ShowAdConfig,
    *,
    http: Optional[AsyncHttpClient] = None,
) -> bool:
    client = http or _default_async_client()
    try:
        response = await client.request(
            "GET",
            _health_url(config.api_base_url),
            timeout=min(5.0, config.request_timeout),
        )
    except OSError:
        return False
    return response.status == 200


__all__ = [
    "claim_redirect_ticket_async",
    "validate_token_async",
    "check_health_async",
]
