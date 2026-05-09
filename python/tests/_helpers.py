"""Shared helpers for the test suite."""

from __future__ import annotations

import base64
import json
import time
from typing import Any, Dict, Optional


def make_jwt(claims: Dict[str, Any]) -> str:
    """Build a JWT-shaped string with an unverified payload (signature ignored)."""

    header = {"alg": "HS256", "typ": "JWT"}
    header_segment = base64.urlsafe_b64encode(json.dumps(header).encode("utf-8")).rstrip(b"=").decode("ascii")
    payload_segment = base64.urlsafe_b64encode(json.dumps(claims).encode("utf-8")).rstrip(b"=").decode("ascii")
    return f"{header_segment}.{payload_segment}.signature-placeholder"


def make_valid_token(
    creator_hash: str,
    fingerprint: Optional[str] = None,
    *,
    ttl: int = 3600,
    iss: Optional[str] = "showad-backend",
) -> str:
    claims: Dict[str, Any] = {
        "creator_hash": creator_hash,
        "exp": int(time.time()) + ttl,
        "nbf": int(time.time()) - 60,
    }
    if fingerprint is not None:
        claims["fingerprint"] = fingerprint
    if iss is not None:
        claims["iss"] = iss
    return make_jwt(claims)


__all__ = ["make_jwt", "make_valid_token"]
