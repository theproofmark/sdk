"""ProofMark Verify client implementation."""

from __future__ import annotations

import json
import socket
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from typing import Callable, Optional


@dataclass(frozen=True)
class VerifyResult:
    """Result from token verification."""

    success: bool
    score: float
    flags: list[str]
    credit: bool
    challenge_ts: Optional[str] = None
    hostname: Optional[str] = None
    action: Optional[str] = None
    error_codes: list[str] = field(default_factory=list)

    def is_human(self, min_score: float = 0.5) -> bool:
        """Check if the result indicates a human (success and score >= threshold)."""
        return self.success and self.score >= min_score

    @classmethod
    def from_dict(cls, data: dict) -> "VerifyResult":
        """Create a VerifyResult from API response dict, normalizing defensively."""
        return cls(
            success=data.get("success") is True,
            score=float(data.get("score") or 0),
            flags=[str(x) for x in (data.get("flags") or [])],
            credit=data.get("credit") is True,
            challenge_ts=data.get("challenge_ts"),
            hostname=data.get("hostname"),
            action=data.get("action"),
            error_codes=list(data.get("error-codes") or []),
        )


class ProofMarkVerifyError(Exception):
    """Exception raised when verification fails due to network/protocol errors."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class ProofMarkVerify:
    """ProofMark Verify client for server-side token verification."""

    def __init__(
        self,
        secret: str,
        base_url: str = "https://api.proofmark.com",
        timeout: float = 5.0,
        *,
        _opener: Optional[Callable[[str, bytes, float], tuple[int, bytes]]] = None,
    ):
        """
        Initialize the ProofMark Verify client.

        Args:
            secret: Your secret key (pmvs_live_... or pmvs_test_...)
            base_url: Base URL for the API (default: https://api.proofmark.com)
            timeout: Request timeout in seconds (default: 5.0)
            _opener: Injectable opener for testing (internal use)

        Raises:
            ValueError: If secret is empty
        """
        if not secret:
            raise ValueError("secret is required")

        self._secret = secret
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._opener = _opener or self._default_opener

    def verify(self, token: str, remoteip: Optional[str] = None) -> VerifyResult:
        """
        Verify a ProofMark Verify token.

        Args:
            token: The pm-verify-response token from the client
            remoteip: The end user's IP address (recommended)

        Returns:
            VerifyResult with success, score, flags, etc.

        Raises:
            ProofMarkVerifyError: On network, timeout, or protocol errors
        """
        # Short-circuit for empty token without making an HTTP call
        if not token:
            return VerifyResult.from_dict(
                {"success": False, "score": 0, "error-codes": ["missing-input-response"]}
            )

        # Build form data
        fields = {"secret": self._secret, "response": token}
        if remoteip:
            fields["remoteip"] = remoteip

        data = urllib.parse.urlencode(fields).encode()

        # Make the request
        url = self._base_url + "/v1/verify/siteverify"
        status, body = self._opener(url, data, self._timeout)

        # Check status
        if status >= 400:
            raise ProofMarkVerifyError(
                "PMV_HTTP_ERROR", f"siteverify returned HTTP {status}"
            )

        # Parse response
        try:
            parsed = json.loads(body)
        except json.JSONDecodeError as e:
            raise ProofMarkVerifyError(
                "PMV_INVALID_RESPONSE", f"siteverify returned invalid JSON: {e}"
            )

        return VerifyResult.from_dict(parsed)

    @staticmethod
    def _default_opener(url: str, data: bytes, timeout: float) -> tuple[int, bytes]:
        """Default urllib-based opener."""
        req = urllib.request.Request(
            url,
            data=data,
            headers={"Content-Type": "application/x-www-form-urlencoded"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                return (resp.status, resp.read())
        except urllib.error.HTTPError as e:
            # HTTPError is raised for 4xx/5xx; return status + body so verify() can handle
            return (e.code, e.read())
        except socket.timeout:
            raise ProofMarkVerifyError(
                "PMV_TIMEOUT", f"siteverify request timed out after {timeout}s"
            )
        except urllib.error.URLError as e:
            # Check if it's a timeout wrapped in URLError
            if isinstance(e.reason, socket.timeout):
                raise ProofMarkVerifyError(
                    "PMV_TIMEOUT", f"siteverify request timed out after {timeout}s"
                )
            raise ProofMarkVerifyError(
                "PMV_NETWORK_ERROR", f"siteverify request failed: {e.reason}"
            )
