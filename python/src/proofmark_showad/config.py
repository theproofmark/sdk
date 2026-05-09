"""Server-side configuration dataclass for the ShowAd SDK."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .exceptions import ShowAdError, ShowAdErrorCode


DEFAULT_API_BASE_URL = "https://ad.proofmark.io"
DEFAULT_VIDEO_AD_URL = "https://showad.proofmark.io"
DEFAULT_COOKIE_PREFIX = "showad"
DEFAULT_COOKIE_MAX_AGE = 3600


@dataclass
class ShowAdConfig:
    """All knobs the ShowAd SDK needs to operate.

    ``creator_hash`` / ``api_key`` / ``redirect_secret`` are mandatory. The
    other fields all have sensible defaults that match the Laravel and Next.js
    reference SDKs on the wire.
    """

    creator_hash: str
    api_key: str
    redirect_secret: str
    api_base_url: str = DEFAULT_API_BASE_URL
    video_ad_url: str = DEFAULT_VIDEO_AD_URL
    cookie_prefix: str = DEFAULT_COOKIE_PREFIX
    cookie_max_age: int = DEFAULT_COOKIE_MAX_AGE
    cookie_secure: Optional[bool] = None
    cookie_same_site: str = "lax"
    debug: bool = False
    request_timeout: float = 10.0
    connect_timeout: float = 5.0
    protected_paths: tuple = field(default_factory=tuple)
    excluded_paths: tuple = field(default_factory=tuple)

    def validate(self) -> None:
        """Raise :class:`ShowAdError` if required fields are missing."""

        for attr in ("creator_hash", "api_key", "redirect_secret"):
            value = getattr(self, attr, None)
            if not value:
                raise ShowAdError(
                    f"Missing required ShowAd configuration: {attr}",
                    code=ShowAdErrorCode.CONFIG_ERROR,
                    details={"key": attr},
                )

    def with_overrides(self, **overrides: object) -> "ShowAdConfig":
        """Return a copy of this config with ``overrides`` applied."""

        data = self.__dict__.copy()
        data.update(overrides)
        return ShowAdConfig(**data)  # type: ignore[arg-type]


__all__ = [
    "ShowAdConfig",
    "DEFAULT_API_BASE_URL",
    "DEFAULT_VIDEO_AD_URL",
    "DEFAULT_COOKIE_PREFIX",
    "DEFAULT_COOKIE_MAX_AGE",
]
