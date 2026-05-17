"""JWT helpers (decode + claim validation, no signature verification).

The ShowAd backend signs tokens; clients only inspect the payload to know when
to refresh or redirect. Signature verification therefore intentionally lives on
the backend.

Defense-in-depth: rejects tokens whose header ``alg`` is ``none`` or outside
the HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist before any
payload claims are inspected.
"""

from __future__ import annotations

import base64
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Iterable, Optional

ISSUER = "showad-backend"
ALLOWED_ALGORITHMS = frozenset(
    {"HS256", "HS384", "HS512", "RS256", "RS384", "RS512", "ES256", "ES384"}
)
DEFAULT_LEEWAY_SECONDS = 60


def _decode_base64_url(value: str) -> Optional[bytes]:
    try:
        padded = value + "=" * (-len(value) % 4)
        return base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, TypeError):
        return None


def _safe_equal(a: Optional[str], b: Optional[str]) -> bool:
    if a is None or b is None:
        return False
    return hmac.compare_digest(a.encode("utf-8"), b.encode("utf-8"))


def decode_token(token: str) -> Optional[Dict[str, Any]]:
    """Return the JWT payload as a dict, or ``None`` if the token is malformed
    or signed with a disallowed algorithm."""

    if not token or not isinstance(token, str):
        return None

    parts = token.split(".")
    if len(parts) != 3:
        return None

    header_bytes = _decode_base64_url(parts[0])
    if header_bytes is None:
        return None
    try:
        header = json.loads(header_bytes.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None
    if not isinstance(header, dict):
        return None
    alg = header.get("alg")
    if not isinstance(alg, str) or alg not in ALLOWED_ALGORITHMS:
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


def is_token_expired(
    token: str,
    *,
    now: Optional[int] = None,
    leeway_seconds: int = DEFAULT_LEEWAY_SECONDS,
) -> bool:
    claims = decode_token(token)
    if not claims:
        return True

    current = int(now) if now is not None else int(time.time())
    leeway = int(leeway_seconds)

    exp = claims.get("exp")
    if isinstance(exp, (int, float)) and (int(exp) + leeway) < current:
        return True

    nbf = claims.get("nbf")
    if isinstance(nbf, (int, float)) and (int(nbf) - leeway) > current:
        return True

    iat = claims.get("iat")
    if isinstance(iat, (int, float)) and (int(iat) - leeway) > current:
        return True

    return False


def get_token_expiry(token: str) -> Optional[int]:
    """Return the token expiry as Unix seconds (matches JWT ``exp`` claim)."""

    claims = decode_token(token)
    if not claims:
        return None
    exp = claims.get("exp")
    if not isinstance(exp, (int, float)):
        return None
    return int(exp)


def get_time_until_expiry(token: str, *, now: Optional[int] = None) -> int:
    expiry = get_token_expiry(token)
    if expiry is None:
        return -1
    current = int(now) if now is not None else int(time.time())
    return expiry - current


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
    leeway_seconds: int = DEFAULT_LEEWAY_SECONDS,
    require_issuer: bool = True,
) -> ValidationResult:
    claims = decode_token(token)
    if not claims:
        return ValidationResult(valid=False, reason="Invalid token format")

    if is_token_expired(token, now=now, leeway_seconds=leeway_seconds):
        return ValidationResult(valid=False, reason="Token expired")

    creator_hash = claims.get("creator_hash")
    if not isinstance(creator_hash, str) or not _safe_equal(creator_hash, expected_creator_hash):
        return ValidationResult(valid=False, reason="Creator hash mismatch")

    if expected_fingerprint is not None:
        fp = claims.get("fingerprint")
        if not isinstance(fp, str) or not _safe_equal(fp, expected_fingerprint):
            return ValidationResult(valid=False, reason="Fingerprint mismatch")

    iss = claims.get("iss")
    if require_issuer:
        if iss != ISSUER:
            return ValidationResult(valid=False, reason="Invalid issuer")
    elif iss is not None and iss != ISSUER:
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
    "ALLOWED_ALGORITHMS",
    "DEFAULT_LEEWAY_SECONDS",
    "ISSUER",
    "ValidationResult",
    "decode_token",
    "is_token_expired",
    "get_token_expiry",
    "get_time_until_expiry",
    "validate_token_claims",
    "get_creator_hash_from_token",
    "get_fingerprint_from_token",
]
