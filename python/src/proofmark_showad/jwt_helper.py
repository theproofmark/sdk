"""JWT helpers (decode + claim validation, no signature verification).

The ShowAd backend signs tokens; clients only inspect the payload to know when
to refresh or redirect. Signature verification therefore intentionally lives on
the backend.
"""

from __future__ import annotations

import base64
import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional


def _decode_base64_url(value: str) -> Optional[bytes]:
    try:
        padded = value + "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, TypeError):
        return None


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Return the JWT payload as a dict, or ``None`` if the token is malformed."""

    if not token or not isinstance(token, str):
        return None

    parts = token.split(".")
    if len(parts) != 3:
        return None

    payload = _decode_base64_url(parts[1])
    if payload is None:
        return None

    try:
        claims = json.loads(payload.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None

    if not isinstance(claims, dict):
        return None
    return claims


def is_token_expired(token: str, *, now: Optional[int] = None) -> bool:
    claims = decode_token(token)
    if not claims:
        return True

    current = int(now) if now is not None else int(time.time())

    exp = claims.get("exp")
    if isinstance(exp, (int, float)) and exp < current:
        return True

    nbf = claims.get("nbf")
    if isinstance(nbf, (int, float)) and nbf > current:
        return True

    return False


def get_token_expiry(token: str) -> Optional[int]:
    """Return the token expiry in **milliseconds** (matches Laravel/Next SDKs)."""

    claims = decode_token(token)
    if not claims:
        return None
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)):
        return None
    return int(exp) * 1000


def get_time_until_expiry(token: str, *, now: Optional[int] = None) -> int:
    expiry_ms = get_token_expiry(token)
    if expiry_ms is None:
        return -1
    current_ms = int(now) * 1000 if now is not None else int(time.time() * 1000)
    return (expiry_ms - current_ms) // 1000


@dataclass
class ValidationResult:
    valid: bool
    reason: Optional[str] = None


def validate_token_claims(
    token: str,
    expected_creator_hash: str,
    expected_fingerprint: Optional[str] = None,
    *,
    now: Optional[int] = None,
) -> ValidationResult:
    claims = decode_token(token)
    if not claims:
        return ValidationResult(valid=False, reason="Invalid token format")

    if is_token_expired(token, now=now):
        return ValidationResult(valid=False, reason="Token expired")

    creator_hash = claims.get("creator_hash")
    if not isinstance(creator_hash, str) or creator_hash != expected_creator_hash:
        return ValidationResult(valid=False, reason="Creator hash mismatch")

    if expected_fingerprint is not None:
        fp = claims.get("fingerprint")
        if not isinstance(fp, str) or fp != expected_fingerprint:
            return ValidationResult(valid=False, reason="Fingerprint mismatch")

    iss = claims.get("iss")
    if iss is not None and iss != "showad-backend":
        return ValidationResult(valid=False, reason="Invalid issuer")

    return ValidationResult(valid=True, reason=None)


def get_creator_hash_from_token(token: str) -> Optional[str]:
    claims = decode_token(token)
    if not claims:
        return None
    value = claims.get("creator_hash")
    return value if isinstance(value, str) else None


def get_fingerprint_from_token(token: str) -> Optional[str]:
    claims = decode_token(token)
    if not claims:
        return None
    value = claims.get("fingerprint")
    return value if isinstance(value, str) else None


__all__ = [
    "ValidationResult",
    "decode_token",
    "is_token_expired",
    "get_token_expiry",
    "get_time_until_expiry",
    "validate_token_claims",
    "get_creator_hash_from_token",
    "get_fingerprint_from_token",
]
