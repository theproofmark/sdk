"""URL helpers."""

from __future__ import annotations

from typing import Optional
from urllib.parse import quote, urlencode, urlparse, urlunparse, parse_qsl


def _trim_slash(url: str) -> str:
    return url.rstrip("/")


def build_video_ad_redirect_url(
    video_ad_url: str,
    creator_hash: str,
    return_url: Optional[str],
) -> str:
    base = _trim_slash(video_ad_url) + "/c/" + quote(creator_hash, safe="")
    params = [("sdk", "1")]
    if return_url:
        params.append(("return_url", return_url))
    return base + "?" + urlencode(params)


def build_resource_redirect_url(
    video_ad_url: str,
    creator_hash: str,
    project_hash: str,
    resource_hash: str,
    return_url: Optional[str] = None,
) -> str:
    base = (
        _trim_slash(video_ad_url)
        + "/c/" + quote(creator_hash, safe="")
        + "/" + quote(project_hash, safe="")
        + "/" + quote(resource_hash, safe="")
    )
    params = [("sdk", "1")]
    if return_url:
        params.append(("return_url", return_url))
    return base + "?" + urlencode(params)


def remove_query_param(url: str, param: str) -> str:
    parsed = urlparse(url)
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True) if k != param]
    new_query = urlencode(query)
    return urlunparse(parsed._replace(query=new_query))


__all__ = [
    "build_video_ad_redirect_url",
    "build_resource_redirect_url",
    "remove_query_param",
]
