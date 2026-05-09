"""ASGI middleware that protects routes via the ShowAd flow.

Uses Starlette's :class:`BaseHTTPMiddleware` so it works in both Starlette and
FastAPI applications.
"""

from __future__ import annotations

from typing import Awaitable, Callable, Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import RedirectResponse, Response
from starlette.types import ASGIApp

from ..access_policy import AccessPolicyOptions
from ..config import ShowAdConfig
from ..core.protect import ProtectAction, ProtectInput, protect_async
from ..cookies import CookieSpec
from ..http_client import AsyncHttpClient, HttpClient


class ShowAdMiddleware(BaseHTTPMiddleware):
    """Starlette/FastAPI ShowAd middleware."""

    def __init__(
        self,
        app: ASGIApp,
        config: ShowAdConfig,
        *,
        access_policy: Optional[AccessPolicyOptions] = None,
        on_verification_failed: Optional[Callable[[str], None]] = None,
        http_client: Optional[HttpClient] = None,
        async_http_client: Optional[AsyncHttpClient] = None,
    ) -> None:
        super().__init__(app)
        self._config = config
        self._access_policy = access_policy
        self._on_failed = on_verification_failed
        self._http_client = http_client
        self._async_http_client = async_http_client

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        inp = _build_input(
            request,
            self._config,
            access_policy=self._access_policy,
            on_verification_failed=self._on_failed,
            http_client=self._http_client,
            async_http_client=self._async_http_client,
        )
        output = await protect_async(inp)

        if output.action == ProtectAction.REDIRECT:
            assert output.redirect_url is not None
            response: Response = RedirectResponse(url=output.redirect_url, status_code=302)
            _apply_cookies(response, output.cookies_to_set, output.cookies_to_clear)
            return response

        response = await call_next(request)
        _apply_cookies(response, output.cookies_to_set, output.cookies_to_clear)
        return response


def _build_input(
    request: Request,
    config: ShowAdConfig,
    *,
    access_policy: Optional[AccessPolicyOptions],
    on_verification_failed: Optional[Callable[[str], None]],
    http_client: Optional[HttpClient],
    async_http_client: Optional[AsyncHttpClient],
) -> ProtectInput:
    headers = {k.decode().lower() if isinstance(k, bytes) else str(k): (v.decode() if isinstance(v, bytes) else str(v)) for k, v in request.headers.items()}
    cookies = {str(k): str(v) for k, v in request.cookies.items()}
    query_params = {str(k): str(v) for k, v in request.query_params.items()}

    client = request.client
    remote_addr = client.host if client else None
    full_url = str(request.url)
    is_secure = request.url.scheme == "https"

    return ProtectInput(
        config=config,
        method=request.method,
        full_url=full_url,
        pathname=request.url.path,
        query_params=query_params,
        cookies=cookies,
        headers=headers,
        remote_addr=remote_addr,
        is_secure=is_secure,
        access_policy=access_policy,
        on_verification_failed=on_verification_failed,
        http_client=http_client,
        async_http_client=async_http_client,
    )


def _apply_cookies(response: Response, set_cookies, clear_cookies) -> None:
    for spec in set_cookies:  # type: CookieSpec
        response.set_cookie(
            key=spec.name,
            value=spec.value,
            max_age=spec.max_age,
            path=spec.path,
            secure=spec.secure,
            httponly=spec.http_only,
            samesite=spec.same_site,
        )
    for spec in clear_cookies:  # type: CookieSpec
        response.delete_cookie(
            key=spec.name,
            path=spec.path,
            samesite=spec.same_site,
        )


__all__ = ["ShowAdMiddleware"]
