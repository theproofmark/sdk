"""ProofMark ShowAd SDK for Python.

Production-ready content-gating SDK that mirrors the Laravel and Next.js
reference implementations on the wire. Pure Python (no hard third-party
dependencies); pluggable HTTP clients and per-framework adapters live behind
optional extras.
"""

from ._version import __version__
from .access_policy import (
    AccessDecision,
    AccessPolicyOptions,
    AccessRequest,
    CrawlerPolicy,
    CrawlerVerification,
    DEFAULT_CRAWLER_FAMILIES,
    evaluate_access_policy,
    evaluate_access_policy_async,
    get_client_ip,
    ip_in_cidrs,
    verify_crawler_request,
    verify_crawler_request_async,
)
from .api import check_health, claim_redirect_ticket, validate_token
from .async_api import (
    check_health_async,
    claim_redirect_ticket_async,
    validate_token_async,
)
from .config import (
    DEFAULT_API_BASE_URL,
    DEFAULT_COOKIE_MAX_AGE,
    DEFAULT_COOKIE_PREFIX,
    DEFAULT_VIDEO_AD_URL,
    ShowAdConfig,
)
from .cookies import (
    ALL_COOKIE_SUFFIXES,
    COOKIE_CREATOR,
    COOKIE_EXPIRES,
    COOKIE_FINGERPRINT,
    COOKIE_TICKET,
    COOKIE_TOKEN,
    COOKIE_VERIFIED,
    CookieSpec,
    cookie_name,
)
from .core.protect import (
    ProtectAction,
    ProtectInput,
    ProtectOutput,
    protect,
    protect_async,
)
from .exceptions import ShowAdError, ShowAdErrorCode
from .http_client import (
    AsyncHttpClient,
    HttpClient,
    HttpResponse,
    HttpxAsyncHttpClient,
    HttpxHttpClient,
    StdlibHttpClient,
)
from .jwt_helper import (
    ValidationResult,
    decode_token,
    get_token_expiry,
    is_token_expired,
    validate_token_claims,
)
from .path_match import path_matches, path_matches_any
from .url import build_resource_redirect_url, build_video_ad_redirect_url

__all__ = [
    "__version__",
    "AccessDecision",
    "AccessPolicyOptions",
    "AccessRequest",
    "AsyncHttpClient",
    "ALL_COOKIE_SUFFIXES",
    "COOKIE_CREATOR",
    "COOKIE_EXPIRES",
    "COOKIE_FINGERPRINT",
    "COOKIE_TICKET",
    "COOKIE_TOKEN",
    "COOKIE_VERIFIED",
    "CookieSpec",
    "CrawlerPolicy",
    "CrawlerVerification",
    "DEFAULT_API_BASE_URL",
    "DEFAULT_COOKIE_MAX_AGE",
    "DEFAULT_COOKIE_PREFIX",
    "DEFAULT_CRAWLER_FAMILIES",
    "DEFAULT_VIDEO_AD_URL",
    "HttpClient",
    "HttpResponse",
    "HttpxAsyncHttpClient",
    "HttpxHttpClient",
    "ProtectAction",
    "ProtectInput",
    "ProtectOutput",
    "ShowAdConfig",
    "ShowAdError",
    "ShowAdErrorCode",
    "StdlibHttpClient",
    "ValidationResult",
    "build_resource_redirect_url",
    "build_video_ad_redirect_url",
    "check_health",
    "check_health_async",
    "claim_redirect_ticket",
    "claim_redirect_ticket_async",
    "cookie_name",
    "decode_token",
    "evaluate_access_policy",
    "evaluate_access_policy_async",
    "get_client_ip",
    "get_token_expiry",
    "ip_in_cidrs",
    "is_token_expired",
    "path_matches",
    "path_matches_any",
    "protect",
    "protect_async",
    "validate_token",
    "validate_token_async",
    "validate_token_claims",
    "verify_crawler_request",
    "verify_crawler_request_async",
]
