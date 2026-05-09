"""Pluggable HTTP client abstractions.

The default :class:`StdlibHttpClient` uses only ``urllib`` (no third-party
dependencies). Publishers may opt-in to the httpx-backed client for connection
pooling and async support.
"""

from __future__ import annotations

import abc
import json
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Dict, Mapping, Optional


@dataclass
class HttpResponse:
    status: int
    body: bytes
    headers: Mapping[str, str]

    def json(self) -> Any:
        if not self.body:
            return None
        try:
            return json.loads(self.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return None


class HttpClient(abc.ABC):
    """Sync HTTP client used by :mod:`proofmark_showad.api`."""

    @abc.abstractmethod
    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Mapping[str, str]] = None,
        json_body: Optional[Mapping[str, Any]] = None,
        timeout: float = 10.0,
    ) -> HttpResponse:
        ...

    def close(self) -> None:  # pragma: no cover - default no-op
        return None


class AsyncHttpClient(abc.ABC):
    @abc.abstractmethod
    async def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Mapping[str, str]] = None,
        json_body: Optional[Mapping[str, Any]] = None,
        timeout: float = 10.0,
    ) -> HttpResponse:
        ...

    async def aclose(self) -> None:  # pragma: no cover - default no-op
        return None


class StdlibHttpClient(HttpClient):
    """Sync HTTP client that uses only ``urllib`` (no third-party deps)."""

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Mapping[str, str]] = None,
        json_body: Optional[Mapping[str, Any]] = None,
        timeout: float = 10.0,
    ) -> HttpResponse:
        body_bytes: Optional[bytes] = None
        merged_headers: Dict[str, str] = dict(headers or {})

        if json_body is not None:
            body_bytes = json.dumps(json_body).encode("utf-8")
            merged_headers.setdefault("Content-Type", "application/json")
            merged_headers["Content-Length"] = str(len(body_bytes))

        req = urllib.request.Request(url=url, data=body_bytes, method=method.upper())
        for key, value in merged_headers.items():
            req.add_header(key, value)

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (trusted backend)
                payload = resp.read()
                resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                return HttpResponse(status=resp.status, body=payload, headers=resp_headers)
        except urllib.error.HTTPError as exc:
            payload = exc.read() if hasattr(exc, "read") else b""
            resp_headers = {k.lower(): v for k, v in (exc.headers or {}).items()}
            return HttpResponse(status=exc.code, body=payload, headers=resp_headers)


class HttpxHttpClient(HttpClient):
    """Sync httpx-backed client. Requires ``httpx`` extra."""

    def __init__(self, *, client: Any = None, timeout: float = 10.0) -> None:
        try:
            import httpx
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "httpx is not installed; install proofmark-showad[httpx] to use HttpxHttpClient"
            ) from exc
        self._owned = client is None
        self._client = client or httpx.Client(timeout=timeout)
        self._default_timeout = timeout

    def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Mapping[str, str]] = None,
        json_body: Optional[Mapping[str, Any]] = None,
        timeout: float = 10.0,
    ) -> HttpResponse:
        resp = self._client.request(
            method.upper(),
            url,
            headers=dict(headers or {}),
            json=json_body if json_body is not None else None,
            timeout=timeout,
        )
        body = resp.content if isinstance(resp.content, (bytes, bytearray)) else bytes(resp.content)
        return HttpResponse(
            status=resp.status_code,
            body=bytes(body),
            headers={k.lower(): v for k, v in resp.headers.items()},
        )

    def close(self) -> None:
        if self._owned:
            self._client.close()


class HttpxAsyncHttpClient(AsyncHttpClient):
    """Async httpx-backed client. Requires ``httpx`` extra."""

    def __init__(self, *, client: Any = None, timeout: float = 10.0) -> None:
        try:
            import httpx
        except ImportError as exc:  # pragma: no cover
            raise RuntimeError(
                "httpx is not installed; install proofmark-showad[httpx] to use HttpxAsyncHttpClient"
            ) from exc
        self._owned = client is None
        self._client = client or httpx.AsyncClient(timeout=timeout)
        self._default_timeout = timeout

    async def request(
        self,
        method: str,
        url: str,
        *,
        headers: Optional[Mapping[str, str]] = None,
        json_body: Optional[Mapping[str, Any]] = None,
        timeout: float = 10.0,
    ) -> HttpResponse:
        resp = await self._client.request(
            method.upper(),
            url,
            headers=dict(headers or {}),
            json=json_body if json_body is not None else None,
            timeout=timeout,
        )
        body = resp.content if isinstance(resp.content, (bytes, bytearray)) else bytes(resp.content)
        return HttpResponse(
            status=resp.status_code,
            body=bytes(body),
            headers={k.lower(): v for k, v in resp.headers.items()},
        )

    async def aclose(self) -> None:
        if self._owned:
            await self._client.aclose()


__all__ = [
    "HttpResponse",
    "HttpClient",
    "AsyncHttpClient",
    "StdlibHttpClient",
    "HttpxHttpClient",
    "HttpxAsyncHttpClient",
]
