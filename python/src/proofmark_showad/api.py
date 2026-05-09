"""Sync ShowAd backend API calls."""

from __future__ import annotations

from typing import Any, Dict, Optional
from urllib.parse import quote

from .config import ShowAdConfig
from .exceptions import ShowAdError, ShowAdErrorCode
from .http_client import HttpClient, HttpResponse, StdlibHttpClient


def _ticket_url(api_base_url: str, ticket_id: str) -> str:
    return api_base_url.rstrip("/") + "/api/redirect-ticket/" + quote(ticket_id, safe="") + "/claim"


def _validate_url(api_base_url: str) -> str:
    return api_base_url.rstrip("/") + "/api/sdk/validate"


def _health_url(api_base_url: str) -> str:
    return api_base_url.rstrip("/") + "/health"


def _claim_headers(config: ShowAdConfig) -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-Redirect-Ticket-Secret": config.redirect_secret,
        "X-ShowAd-API-Key": config.api_key,
        "X-ShowAd-Creator-Hash": config.creator_hash,
    }


def _validate_headers(config: ShowAdConfig) -> Dict[str, str]:
    return {
        "Content-Type": "application/json",
        "X-ShowAd-API-Key": config.api_key,
        "X-ShowAd-Creator-Hash": config.creator_hash,
    }


def _interpret_claim_response(response: HttpResponse) -> Dict[str, Any]:
    if 200 <= response.status < 300:
        data = response.json()
        if not isinstance(data, dict) or not data.get("token") or not data.get("creator_hash"):
            raise ShowAdError(
                "Invalid ticket claim response from ShowAd backend",
                code=ShowAdErrorCode.TICKET_CLAIM_FAILED,
                details={"response": data},
            )
        return data

    body = response.json()
    msg = body.get("error") if isinstance(body, dict) else None

    if response.status == 410:
        raise ShowAdError(
            msg or "Redirect ticket not found or already consumed",
            code=ShowAdErrorCode.TICKET_NOT_FOUND,
            details={"status": response.status, "response": body},
        )
    if response.status == 401:
        raise ShowAdError(
            msg or "Invalid redirect ticket secret",
            code=ShowAdErrorCode.TICKET_CLAIM_FAILED,
            details={"status": response.status, "response": body},
        )
    if response.status == 403:
        raise ShowAdError(
            msg or "Creator hash does not match ticket",
            code=ShowAdErrorCode.CREATOR_MISMATCH,
            details={"status": response.status, "response": body},
        )
    raise ShowAdError(
        msg or f"Failed to claim redirect ticket: HTTP {response.status}",
        code=ShowAdErrorCode.NETWORK_ERROR,
        details={"status": response.status, "response": body},
    )


def claim_redirect_ticket(
    config: ShowAdConfig,
    ticket_id: str,
    *,
    http: Optional[HttpClient] = None,
) -> Dict[str, Any]:
    """Claim a redirect ticket. Returns ``{token, creator_hash, ticket_id, ...}``."""

    config.validate()
    client = http or StdlibHttpClient()
    try:
        response = client.request(
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


def validate_token(
    config: ShowAdConfig,
    token: str,
    *,
    http: Optional[HttpClient] = None,
) -> Dict[str, Any]:
    config.validate()
    client = http or StdlibHttpClient()
    try:
        response = client.request(
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


def check_health(
    config: ShowAdConfig,
    *,
    http: Optional[HttpClient] = None,
) -> bool:
    client = http or StdlibHttpClient()
    try:
        response = client.request(
            "GET",
            _health_url(config.api_base_url),
            timeout=min(5.0, config.request_timeout),
        )
    except OSError:
        return False
    return response.status == 200


__all__ = ["claim_redirect_ticket", "validate_token", "check_health"]
