"""Django middleware that protects routes via the ShowAd flow."""

from __future__ import annotations

from typing import Any, Callable, Optional

from django.conf import settings
from django.http import HttpRequest, HttpResponse, HttpResponseRedirect

from ..access_policy import AccessPolicyOptions
from ..config import ShowAdConfig
from ..core.protect import ProtectAction, ProtectInput, protect
from ..cookies import CookieSpec
from ..http_client import HttpClient


def _build_input_from_request(
    request: HttpRequest,
    config: ShowAdConfig,
    *,
    access_policy: Optional[AccessPolicyOptions],
    on_verification_failed: Optional[Callable[[str], None]],
    http_client: Optional[HttpClient],
) -> ProtectInput:
    headers = {key: value for key, value in request.headers.items()}
    cookies = dict(request.COOKIES)
    full_url = request.build_absolute_uri()
    pathname = request.path
    query_params = {k: v for k, v in request.GET.items()}

    return ProtectInput(
        config=config,
        method=request.method or "GET",
        full_url=full_url,
        pathname=pathname,
        query_params=query_params,
        cookies=cookies,
        headers=headers,
        remote_addr=request.META.get("REMOTE_ADDR"),
        is_secure=request.is_secure(),
        access_policy=access_policy,
        on_verification_failed=on_verification_failed,
        http_client=http_client,
    )


def _apply_cookies(response: HttpResponse, set_cookies, clear_cookies) -> None:
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


class ShowAdMiddleware:
    """Generic Django middleware bound to ``settings.SHOWAD``.

    ``settings.SHOWAD`` must be a dict with at minimum ``creator_hash``,
    ``api_key``, ``redirect_secret``. Optional keys: ``api_base_url``,
    ``video_ad_url``, ``cookie_prefix``, ``cookie_max_age``, ``debug``,
    ``protected_paths``, ``excluded_paths``, ``access_policy``.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response
        raw = getattr(settings, "SHOWAD", None)
        if not isinstance(raw, dict):
            raise RuntimeError("settings.SHOWAD must be a dict; see proofmark_showad docs")

        runtime_keys = {"access_policy", "on_verification_failed", "http_client"}
        kwargs = {k: v for k, v in raw.items() if k not in runtime_keys}
        protected = kwargs.get("protected_paths")
        if isinstance(protected, list):
            kwargs["protected_paths"] = tuple(protected)
        excluded = kwargs.get("excluded_paths")
        if isinstance(excluded, list):
            kwargs["excluded_paths"] = tuple(excluded)
        self.config = ShowAdConfig(**kwargs)
        self.access_policy: Optional[AccessPolicyOptions] = raw.get("access_policy")
        self.on_failed: Optional[Callable[[str], None]] = raw.get("on_verification_failed")
        self.http_client: Optional[HttpClient] = raw.get("http_client")

    def __call__(self, request: HttpRequest) -> HttpResponse:
        return _process(
            request,
            self.get_response,
            self.config,
            access_policy=self.access_policy,
            on_verification_failed=self.on_failed,
            http_client=self.http_client,
        )


def build_showad_middleware(
    config: ShowAdConfig,
    *,
    access_policy: Optional[AccessPolicyOptions] = None,
    on_verification_failed: Optional[Callable[[str], None]] = None,
    http_client: Optional[HttpClient] = None,
):
    """Factory that returns a Django middleware class bound to a programmatic config.

    Useful when you can't (or don't want to) use ``settings.SHOWAD``.
    """

    class _BoundShowAdMiddleware:
        def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
            self.get_response = get_response

        def __call__(self, request: HttpRequest) -> HttpResponse:
            return _process(
                request,
                self.get_response,
                config,
                access_policy=access_policy,
                on_verification_failed=on_verification_failed,
                http_client=http_client,
            )

    _BoundShowAdMiddleware.__name__ = "ShowAdMiddleware"
    return _BoundShowAdMiddleware


def _process(
    request: HttpRequest,
    get_response: Callable[[HttpRequest], HttpResponse],
    config: ShowAdConfig,
    *,
    access_policy: Optional[AccessPolicyOptions],
    on_verification_failed: Optional[Callable[[str], None]],
    http_client: Optional[HttpClient],
) -> HttpResponse:
    inp = _build_input_from_request(
        request,
        config,
        access_policy=access_policy,
        on_verification_failed=on_verification_failed,
        http_client=http_client,
    )
    output = protect(inp)

    if output.action == ProtectAction.REDIRECT:
        assert output.redirect_url is not None
        response = HttpResponseRedirect(output.redirect_url)
        _apply_cookies(response, output.cookies_to_set, output.cookies_to_clear)
        return response

    response = get_response(request)
    _apply_cookies(response, output.cookies_to_set, output.cookies_to_clear)
    return response


__all__ = ["ShowAdMiddleware", "build_showad_middleware"]
