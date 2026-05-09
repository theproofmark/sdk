"""Flask integration via a ``before_request`` hook factory."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable, Optional

from flask import Flask, Response, redirect, request as flask_request

from ..access_policy import AccessPolicyOptions
from ..config import ShowAdConfig
from ..core.protect import ProtectAction, ProtectInput, ProtectOutput, protect
from ..cookies import CookieSpec
from ..http_client import HttpClient


_PENDING_ATTR = "_proofmark_showad_pending_cookies"


def init_showad(
    app: Flask,
    config: ShowAdConfig,
    *,
    access_policy: Optional[AccessPolicyOptions] = None,
    on_verification_failed: Optional[Callable[[str], None]] = None,
    http_client: Optional[HttpClient] = None,
) -> None:
    """Register ShowAd protection on a Flask app.

    Adds a ``before_request`` hook that may short-circuit with a redirect, plus
    an ``after_request`` hook that applies any deferred cookies on the response.
    """

    @app.before_request
    def _showad_before_request():
        from flask import g

        cookies = {k: v for k, v in flask_request.cookies.items()}
        headers = {k: v for k, v in flask_request.headers.items()}
        query_params = {k: v for k, v in flask_request.args.items()}

        inp = ProtectInput(
            config=config,
            method=flask_request.method,
            full_url=flask_request.url,
            pathname=flask_request.path,
            query_params=query_params,
            cookies=cookies,
            headers=headers,
            remote_addr=flask_request.remote_addr,
            is_secure=flask_request.is_secure,
            access_policy=access_policy,
            on_verification_failed=on_verification_failed,
            http_client=http_client,
        )
        output: ProtectOutput = protect(inp)

        if output.action == ProtectAction.REDIRECT:
            assert output.redirect_url is not None
            response = redirect(output.redirect_url, code=302)
            _apply_cookies(response, output.cookies_to_set, output.cookies_to_clear)
            return response

        setattr(g, _PENDING_ATTR, (list(output.cookies_to_set), list(output.cookies_to_clear)))
        return None

    @app.after_request
    def _showad_after_request(response: Response):
        from flask import g

        pending = getattr(g, _PENDING_ATTR, None)
        if pending is None:
            return response
        set_cookies, clear_cookies = pending
        _apply_cookies(response, set_cookies, clear_cookies)
        return response


def _apply_cookies(response: Response, set_cookies, clear_cookies) -> None:
    for spec in set_cookies:  # type: CookieSpec
        response.set_cookie(
            spec.name,
            spec.value,
            max_age=spec.max_age,
            path=spec.path,
            secure=spec.secure,
            httponly=spec.http_only,
            samesite=spec.same_site.capitalize(),
        )
    for spec in clear_cookies:  # type: CookieSpec
        response.delete_cookie(spec.name, path=spec.path, samesite=spec.same_site.capitalize())


__all__ = ["init_showad"]
