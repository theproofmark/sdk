"""Pure, framework-free protection logic.

The middleware/decorator wrappers translate framework requests into
:class:`ProtectInput`, call :func:`protect` (or :func:`protect_async`), then
translate the resulting :class:`ProtectOutput` back into a framework response.

This keeps the protocol logic in one testable place.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional, Union

from ..access_policy import (
    AccessPolicyOptions,
    AccessRequest,
    evaluate_access_policy,
    evaluate_access_policy_async,
)
from ..api import claim_redirect_ticket, validate_token
from ..async_api import claim_redirect_ticket_async, validate_token_async
from ..config import ShowAdConfig
from ..cookies import (
    COOKIE_CREATOR,
    COOKIE_EXPIRES,
    COOKIE_FINGERPRINT,
    COOKIE_TICKET,
    COOKIE_TOKEN,
    COOKIE_VERIFIED,
    CookieSpec,
    build_clear_cookie_specs,
    build_set_cookie_specs,
    cookie_name,
)
from ..exceptions import ShowAdError
from ..http_client import AsyncHttpClient, HttpClient
from ..jwt_helper import (
    get_token_expiry,
    is_token_expired,
    validate_token_claims,
)
from ..path_match import path_matches_any
from ..url import build_video_ad_redirect_url, remove_query_param


class ProtectAction(str, Enum):
    """High-level outcome of :func:`protect`."""

    CONTINUE = "continue"  # request is allowed; pass to downstream handler
    REDIRECT = "redirect"  # short-circuit with a redirect response


@dataclass
class ProtectInput:
    """Normalized request data fed into :func:`protect`."""

    config: ShowAdConfig
    method: str
    full_url: str
    pathname: str
    query_params: Mapping[str, str]
    cookies: Mapping[str, str]
    headers: Mapping[str, str] = field(default_factory=dict)
    remote_addr: Optional[str] = None
    is_secure: bool = False
    access_policy: Optional[AccessPolicyOptions] = None
    on_verification_failed: Optional[Callable[[str], None]] = None
    http_client: Optional[HttpClient] = None
    async_http_client: Optional[AsyncHttpClient] = None

    def cookie(self, suffix: str) -> Optional[str]:
        return self.cookies.get(cookie_name(self.config.cookie_prefix, suffix))


@dataclass
class ProtectOutput:
    """Framework-agnostic instruction set produced by :func:`protect`."""

    action: ProtectAction
    redirect_url: Optional[str] = None
    cookies_to_set: List[CookieSpec] = field(default_factory=list)
    cookies_to_clear: List[CookieSpec] = field(default_factory=list)
    reason: Optional[str] = None
    debug_log: List[str] = field(default_factory=list)

    @property
    def is_redirect(self) -> bool:
        return self.action == ProtectAction.REDIRECT


def _is_path_active(pathname: str, config: ShowAdConfig) -> bool:
    """Return True iff the SDK should run on this request."""

    excluded = config.excluded_paths or ()
    protected = config.protected_paths or ()

    if excluded and path_matches_any(pathname, excluded):
        return False

    if not protected:
        return True

    return path_matches_any(pathname, protected)


def _redirect_to_video_ad(
    inp: ProtectInput,
    debug: List[str],
    reason: str,
) -> ProtectOutput:
    redirect_url = build_video_ad_redirect_url(
        inp.config.video_ad_url,
        inp.config.creator_hash,
        inp.full_url,
    )
    secure = _resolve_secure(inp)
    return ProtectOutput(
        action=ProtectAction.REDIRECT,
        redirect_url=redirect_url,
        cookies_to_clear=build_clear_cookie_specs(inp.config, secure=secure),
        reason=reason,
        debug_log=debug,
    )


def _resolve_secure(inp: ProtectInput) -> bool:
    if inp.config.cookie_secure is not None:
        return bool(inp.config.cookie_secure)
    return inp.is_secure


def _build_access_request(inp: ProtectInput) -> AccessRequest:
    return AccessRequest(
        headers=inp.headers,
        pathname=inp.pathname,
        remote_addr=inp.remote_addr,
        method=inp.method,
    )


def _on_failed(inp: ProtectInput, reason: str) -> None:
    if inp.on_verification_failed is not None:
        try:
            inp.on_verification_failed(reason)
        except Exception:  # noqa: BLE001 - publisher-supplied callback
            pass


def _handle_access_decision(
    inp: ProtectInput,
    decision_action: str,
    decision_reason: Optional[str],
    decision_redirect_url: Optional[str],
    debug: List[str],
) -> Optional[ProtectOutput]:
    if decision_action == "allow":
        debug.append(f"access_policy:allow:{decision_reason or 'unknown'}")
        return ProtectOutput(action=ProtectAction.CONTINUE, reason=decision_reason, debug_log=debug)
    if decision_action == "redirect":
        debug.append(f"access_policy:redirect:{decision_reason or 'unknown'}")
        target = decision_redirect_url or build_video_ad_redirect_url(
            inp.config.video_ad_url,
            inp.config.creator_hash,
            inp.full_url,
        )
        secure = _resolve_secure(inp)
        return ProtectOutput(
            action=ProtectAction.REDIRECT,
            redirect_url=target,
            cookies_to_clear=build_clear_cookie_specs(inp.config, secure=secure),
            reason=decision_reason,
            debug_log=debug,
        )
    return None


def _handle_existing_token(
    inp: ProtectInput,
    debug: List[str],
    *,
    token: str,
    fingerprint: Optional[str],
    stored_creator: Optional[str],
    existing_verified: Optional[str],
    existing_expires: Optional[str],
    existing_ticket: Optional[str],
) -> ProtectOutput:
    if is_token_expired(token):
        debug.append("token:expired")
        _on_failed(inp, "expired_token")
        return _redirect_to_video_ad(inp, debug, "expired_token")

    validation = validate_token_claims(token, inp.config.creator_hash, fingerprint)
    if not validation.valid:
        debug.append(f"token:invalid:{validation.reason}")
        _on_failed(inp, "invalid_token")
        return _redirect_to_video_ad(inp, debug, "invalid_token")

    try:
        validate_token(inp.config, token, http=inp.http_client)
    except ShowAdError as exc:
        debug.append(f"token:backend_invalid:{exc.error_name}")
        _on_failed(inp, "invalid_token")
        return _redirect_to_video_ad(inp, debug, "invalid_token")

    debug.append("token:valid")
    expiry = get_token_expiry(token)
    needs_refresh = (
        existing_verified != "1"
        or stored_creator != inp.config.creator_hash
        or (expiry is not None and existing_expires != str(expiry))
    )
    if needs_refresh:
        secure = _resolve_secure(inp)
        return ProtectOutput(
            action=ProtectAction.CONTINUE,
            cookies_to_set=build_set_cookie_specs(
                inp.config,
                token=token,
                creator_hash=inp.config.creator_hash,
                ticket_id=existing_ticket,
                token_expiry=expiry,
                secure=secure,
            ),
            reason="token_valid",
            debug_log=debug,
        )

    return ProtectOutput(action=ProtectAction.CONTINUE, reason="token_valid", debug_log=debug)


async def _handle_existing_token_async(
    inp: ProtectInput,
    debug: List[str],
    *,
    token: str,
    fingerprint: Optional[str],
    stored_creator: Optional[str],
    existing_verified: Optional[str],
    existing_expires: Optional[str],
    existing_ticket: Optional[str],
) -> ProtectOutput:
    if is_token_expired(token):
        debug.append("token:expired")
        _on_failed(inp, "expired_token")
        return _redirect_to_video_ad(inp, debug, "expired_token")

    validation = validate_token_claims(token, inp.config.creator_hash, fingerprint)
    if not validation.valid:
        debug.append(f"token:invalid:{validation.reason}")
        _on_failed(inp, "invalid_token")
        return _redirect_to_video_ad(inp, debug, "invalid_token")

    try:
        if inp.async_http_client is not None:
            await validate_token_async(inp.config, token, http=inp.async_http_client)
        else:
            validate_token(inp.config, token, http=inp.http_client)
    except ShowAdError as exc:
        debug.append(f"token:backend_invalid:{exc.error_name}")
        _on_failed(inp, "invalid_token")
        return _redirect_to_video_ad(inp, debug, "invalid_token")

    debug.append("token:valid")
    expiry = get_token_expiry(token)
    needs_refresh = (
        existing_verified != "1"
        or stored_creator != inp.config.creator_hash
        or (expiry is not None and existing_expires != str(expiry))
    )
    if needs_refresh:
        secure = _resolve_secure(inp)
        return ProtectOutput(
            action=ProtectAction.CONTINUE,
            cookies_to_set=build_set_cookie_specs(
                inp.config,
                token=token,
                creator_hash=inp.config.creator_hash,
                ticket_id=existing_ticket,
                token_expiry=expiry,
                secure=secure,
            ),
            reason="token_valid",
            debug_log=debug,
        )

    return ProtectOutput(action=ProtectAction.CONTINUE, reason="token_valid", debug_log=debug)


def _handle_ticket_claim_success(
    inp: ProtectInput,
    debug: List[str],
    claim: Dict[str, Any],
    redirect_ticket: str,
) -> ProtectOutput:
    if claim.get("creator_hash") != inp.config.creator_hash:
        debug.append("ticket:creator_mismatch")
        _on_failed(inp, "creator_mismatch")
        return _redirect_to_video_ad(inp, debug, "creator_mismatch")

    clean_url = remove_query_param(inp.full_url, "redirect_ticket")
    secure = _resolve_secure(inp)
    debug.append("ticket:claimed")

    token = str(claim.get("token", ""))
    return ProtectOutput(
        action=ProtectAction.REDIRECT,
        redirect_url=clean_url,
        cookies_to_set=build_set_cookie_specs(
            inp.config,
            token=token,
            creator_hash=str(claim.get("creator_hash", inp.config.creator_hash)),
            ticket_id=str(claim.get("ticket_id", redirect_ticket)),
            token_expiry=get_token_expiry(token),
            secure=secure,
        ),
        reason="ticket_claimed",
        debug_log=debug,
    )


def _early_passthrough(inp: ProtectInput, debug: List[str]) -> Optional[ProtectOutput]:
    """Path matching: paths the SDK shouldn't touch return ``CONTINUE`` early."""

    if not _is_path_active(inp.pathname, inp.config):
        debug.append("path:skipped")
        return ProtectOutput(action=ProtectAction.CONTINUE, reason="path_skipped", debug_log=debug)
    return None


def _no_fingerprint_redirect(inp: ProtectInput, debug: List[str], reason: str) -> ProtectOutput:
    debug.append(f"fingerprint:missing ({reason})")
    _on_failed(inp, "no_fingerprint")
    return _redirect_to_video_ad(inp, debug, "no_fingerprint")


def protect(inp: ProtectInput) -> ProtectOutput:
    """Synchronous protect pipeline.

    Order: path match → access policy → ticket claim → token validate → redirect.
    """

    debug: List[str] = []

    skipped = _early_passthrough(inp, debug)
    if skipped is not None:
        return skipped

    if inp.access_policy is not None:
        decision = evaluate_access_policy(_build_access_request(inp), inp.access_policy)
        outcome = _handle_access_decision(
            inp, decision.action, decision.reason, decision.redirect_url, debug
        )
        if outcome is not None:
            return outcome

    fingerprint = inp.cookie(COOKIE_FINGERPRINT)
    existing_token = inp.cookie(COOKIE_TOKEN)
    redirect_ticket = inp.query_params.get("redirect_ticket") if inp.query_params else None

    if redirect_ticket:
        debug.append(f"ticket:found:{redirect_ticket}")
        if not fingerprint:
            return _no_fingerprint_redirect(inp, debug, "ticket_without_fingerprint")
        try:
            claim = claim_redirect_ticket(inp.config, redirect_ticket, http=inp.http_client)
        except ShowAdError as exc:
            debug.append(f"ticket:claim_failed:{exc.error_name}")
            _on_failed(inp, "ticket_claim_failed")
            return _redirect_to_video_ad(inp, debug, "ticket_claim_failed")
        return _handle_ticket_claim_success(inp, debug, claim, redirect_ticket)

    if existing_token:
        return _handle_existing_token(
            inp,
            debug,
            token=existing_token,
            fingerprint=fingerprint,
            stored_creator=inp.cookie(COOKIE_CREATOR),
            existing_verified=inp.cookie(COOKIE_VERIFIED),
            existing_expires=inp.cookie(COOKIE_EXPIRES),
            existing_ticket=inp.cookie(COOKIE_TICKET),
        )

    debug.append("no_verification")
    _on_failed(inp, "no_verification")
    return _redirect_to_video_ad(inp, debug, "no_verification")


async def protect_async(inp: ProtectInput) -> ProtectOutput:
    """Async protect pipeline (mirrors :func:`protect`)."""

    debug: List[str] = []

    skipped = _early_passthrough(inp, debug)
    if skipped is not None:
        return skipped

    if inp.access_policy is not None:
        decision = await evaluate_access_policy_async(_build_access_request(inp), inp.access_policy)
        outcome = _handle_access_decision(
            inp, decision.action, decision.reason, decision.redirect_url, debug
        )
        if outcome is not None:
            return outcome

    fingerprint = inp.cookie(COOKIE_FINGERPRINT)
    existing_token = inp.cookie(COOKIE_TOKEN)
    redirect_ticket = inp.query_params.get("redirect_ticket") if inp.query_params else None

    if redirect_ticket:
        debug.append(f"ticket:found:{redirect_ticket}")
        if not fingerprint:
            return _no_fingerprint_redirect(inp, debug, "ticket_without_fingerprint")
        try:
            if inp.async_http_client is not None:
                claim = await claim_redirect_ticket_async(
                    inp.config, redirect_ticket, http=inp.async_http_client
                )
            else:
                claim = claim_redirect_ticket(inp.config, redirect_ticket, http=inp.http_client)
        except ShowAdError as exc:
            debug.append(f"ticket:claim_failed:{exc.error_name}")
            _on_failed(inp, "ticket_claim_failed")
            return _redirect_to_video_ad(inp, debug, "ticket_claim_failed")
        return _handle_ticket_claim_success(inp, debug, claim, redirect_ticket)

    if existing_token:
        return await _handle_existing_token_async(
            inp,
            debug,
            token=existing_token,
            fingerprint=fingerprint,
            stored_creator=inp.cookie(COOKIE_CREATOR),
            existing_verified=inp.cookie(COOKIE_VERIFIED),
            existing_expires=inp.cookie(COOKIE_EXPIRES),
            existing_ticket=inp.cookie(COOKIE_TICKET),
        )

    debug.append("no_verification")
    _on_failed(inp, "no_verification")
    return _redirect_to_video_ad(inp, debug, "no_verification")


__all__ = [
    "ProtectAction",
    "ProtectInput",
    "ProtectOutput",
    "protect",
    "protect_async",
]
