"""ShowAd SDK exceptions."""

from __future__ import annotations

from typing import Any, Dict, Optional


class ShowAdErrorCode:
    """Numeric error codes that mirror the Laravel/Next reference SDKs."""

    FINGERPRINT_FAILED = 1001
    TICKET_NOT_FOUND = 1002
    TICKET_EXPIRED = 1003
    TICKET_CLAIM_FAILED = 1004
    TOKEN_INVALID = 1005
    TOKEN_EXPIRED = 1006
    CREATOR_MISMATCH = 1007
    NETWORK_ERROR = 1008
    CONFIG_ERROR = 1009


_NAME_MAP: Dict[int, str] = {
    ShowAdErrorCode.FINGERPRINT_FAILED: "FINGERPRINT_FAILED",
    ShowAdErrorCode.TICKET_NOT_FOUND: "TICKET_NOT_FOUND",
    ShowAdErrorCode.TICKET_EXPIRED: "TICKET_EXPIRED",
    ShowAdErrorCode.TICKET_CLAIM_FAILED: "TICKET_CLAIM_FAILED",
    ShowAdErrorCode.TOKEN_INVALID: "TOKEN_INVALID",
    ShowAdErrorCode.TOKEN_EXPIRED: "TOKEN_EXPIRED",
    ShowAdErrorCode.CREATOR_MISMATCH: "CREATOR_MISMATCH",
    ShowAdErrorCode.NETWORK_ERROR: "NETWORK_ERROR",
    ShowAdErrorCode.CONFIG_ERROR: "CONFIG_ERROR",
}


class ShowAdError(Exception):
    """Domain exception raised by the ShowAd SDK.

    ``code`` is one of :class:`ShowAdErrorCode`. ``details`` carries arbitrary
    structured context (e.g. backend response body, status code) that is useful
    in logs and exception handlers.
    """

    def __init__(
        self,
        message: str = "",
        code: int = 0,
        *,
        details: Optional[Dict[str, Any]] = None,
        cause: Optional[BaseException] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.details: Dict[str, Any] = dict(details or {})
        if cause is not None:
            self.__cause__ = cause

    @property
    def error_name(self) -> str:
        return _NAME_MAP.get(self.code, "UNKNOWN_ERROR")

    def __repr__(self) -> str:  # pragma: no cover - cosmetic
        return f"ShowAdError(code={self.code}, name={self.error_name!r}, message={str(self)!r})"


__all__ = ["ShowAdError", "ShowAdErrorCode"]
