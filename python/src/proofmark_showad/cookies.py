"""Cookie name constants and helpers."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable, Optional

from .config import ShowAdConfig

COOKIE_FINGERPRINT = "fingerprint"
COOKIE_TOKEN = "token"
COOKIE_CREATOR = "creator"
COOKIE_TICKET = "ticket"
COOKIE_VERIFIED = "verified"
COOKIE_EXPIRES = "expires"
COOKIE_META = "meta"

ALL_COOKIE_SUFFIXES: tuple = (
    COOKIE_FINGERPRINT,
    COOKIE_TOKEN,
    COOKIE_CREATOR,
    COOKIE_TICKET,
    COOKIE_VERIFIED,
    COOKIE_EXPIRES,
)


def cookie_name(prefix: str, suffix: str) -> str:
    return f"{prefix}_{suffix}"


def all_cookie_names(prefix: str) -> Iterable[str]:
    for suffix in ALL_COOKIE_SUFFIXES:
        yield cookie_name(prefix, suffix)


@dataclass
class CookieSpec:
    """Description of a cookie to set or clear in a framework-agnostic way."""

    name: str
    value: str
    max_age: int
    http_only: bool = False
    secure: bool = False
    same_site: str = "lax"
    path: str = "/"

    @property
    def is_clear(self) -> bool:
        return self.max_age <= 0 and self.value == ""


def build_set_cookie_specs(
    config: ShowAdConfig,
    *,
    token: Optional[str],
    creator_hash: Optional[str],
    ticket_id: Optional[str],
    token_expiry: Optional[int],
    secure: bool,
) -> list:
    """Build a list of :class:`CookieSpec` to set verification cookies."""

    max_age = config.cookie_max_age
    same_site = config.cookie_same_site
    prefix = config.cookie_prefix

    specs: list = []
    if token:
        specs.append(
            CookieSpec(
                name=cookie_name(prefix, COOKIE_TOKEN),
                value=token,
                max_age=max_age,
                http_only=True,
                secure=secure,
                same_site=same_site,
            )
        )
        specs.append(
            CookieSpec(
                name=cookie_name(prefix, COOKIE_VERIFIED),
                value="1",
                max_age=max_age,
                secure=secure,
                same_site=same_site,
            )
        )
    if creator_hash:
        specs.append(
            CookieSpec(
                name=cookie_name(prefix, COOKIE_CREATOR),
                value=creator_hash,
                max_age=max_age,
                secure=secure,
                same_site=same_site,
            )
        )
    if ticket_id:
        specs.append(
            CookieSpec(
                name=cookie_name(prefix, COOKIE_TICKET),
                value=ticket_id,
                max_age=max_age,
                secure=secure,
                same_site=same_site,
            )
        )
    if token_expiry is not None:
        specs.append(
            CookieSpec(
                name=cookie_name(prefix, COOKIE_EXPIRES),
                value=str(token_expiry),
                max_age=max_age,
                secure=secure,
                same_site=same_site,
            )
        )
    return specs


def build_clear_cookie_specs(config: ShowAdConfig, *, secure: bool) -> list:
    prefix = config.cookie_prefix
    same_site = config.cookie_same_site
    return [
        CookieSpec(
            name=cookie_name(prefix, suffix),
            value="",
            max_age=0,
            http_only=(suffix == COOKIE_TOKEN),
            secure=secure,
            same_site=same_site,
        )
        for suffix in (
            COOKIE_TOKEN,
            COOKIE_VERIFIED,
            COOKIE_CREATOR,
            COOKIE_TICKET,
            COOKIE_EXPIRES,
        )
    ]


__all__ = [
    "COOKIE_FINGERPRINT",
    "COOKIE_TOKEN",
    "COOKIE_CREATOR",
    "COOKIE_TICKET",
    "COOKIE_VERIFIED",
    "COOKIE_EXPIRES",
    "COOKIE_META",
    "ALL_COOKIE_SUFFIXES",
    "CookieSpec",
    "cookie_name",
    "all_cookie_names",
    "build_set_cookie_specs",
    "build_clear_cookie_specs",
]
