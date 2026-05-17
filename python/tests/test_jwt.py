from __future__ import annotations

import time

from proofmark_showad.jwt_helper import (
    decode_token,
    get_token_expiry,
    is_token_expired,
    validate_token_claims,
)
from tests._helpers import make_jwt, make_valid_token


def test_decode_valid_token():
    token = make_jwt({"creator_hash": "abc", "exp": int(time.time()) + 60})
    claims = decode_token(token)
    assert claims is not None
    assert claims["creator_hash"] == "abc"


def test_decode_invalid_token_returns_none():
    assert decode_token("not.a.jwt") is None
    assert decode_token("only.two") is None
    assert decode_token("") is None


def test_is_token_expired_true_when_exp_in_past():
    token = make_jwt({"creator_hash": "abc", "exp": int(time.time()) - 10})
    assert is_token_expired(token) is True


def test_is_token_expired_true_when_nbf_in_future():
    token = make_jwt({"creator_hash": "abc", "nbf": int(time.time()) + 600})
    assert is_token_expired(token) is True


def test_is_token_expired_false_when_valid():
    token = make_valid_token("abc")
    assert is_token_expired(token) is False


def test_get_token_expiry_returns_seconds():
    exp = int(time.time()) + 60
    token = make_jwt({"creator_hash": "abc", "exp": exp})
    assert get_token_expiry(token) == exp


def test_validate_token_claims_creator_mismatch():
    token = make_valid_token("abc")
    result = validate_token_claims(token, "other")
    assert result.valid is False
    assert "Creator hash" in (result.reason or "")


def test_validate_token_claims_fingerprint_mismatch():
    token = make_valid_token("abc", fingerprint="fp1")
    result = validate_token_claims(token, "abc", expected_fingerprint="fp2")
    assert result.valid is False
    assert "Fingerprint" in (result.reason or "")


def test_validate_token_claims_invalid_issuer():
    token = make_valid_token("abc", iss="something-else")
    result = validate_token_claims(token, "abc")
    assert result.valid is False
    assert "issuer" in (result.reason or "").lower()


def test_validate_token_claims_happy_path():
    token = make_valid_token("abc", fingerprint="fp1")
    result = validate_token_claims(token, "abc", expected_fingerprint="fp1")
    assert result.valid is True
    assert result.reason is None


def test_validate_token_claims_missing_iss_rejected_by_default():
    """Strict-issuer mode is the default — tokens without `iss` are invalid."""
    token = make_valid_token("abc", iss=None)
    result = validate_token_claims(token, "abc")
    assert result.valid is False
    assert "issuer" in (result.reason or "").lower()


def test_validate_token_claims_no_iss_allowed_when_require_issuer_false():
    token = make_valid_token("abc", iss=None)
    result = validate_token_claims(token, "abc", require_issuer=False)
    assert result.valid is True
