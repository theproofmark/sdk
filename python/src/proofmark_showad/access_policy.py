"""Framework-free access policy evaluation.

The middleware translates a normalized request into :class:`AccessRequest`,
hands it to :func:`evaluate_access_policy`, and acts on the resulting decision.

Pipeline (must mirror Laravel/Next reference SDKs):
    1. Verified crawler (UA family AND trusted IP/CIDR | rDNS | CF verified-bot)
    2. CIDR allowlist (uses configured trusted IP headers)
    3. Publisher-defined ``before_protect`` callback

UA match alone NEVER grants bypass.
"""

from __future__ import annotations

import ipaddress
import re
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Dict, List, Mapping, Optional, Tuple, Union


CrawlerFamily = str  # "google" | "bing" | ...

_DEFAULT_CRAWLER_USER_AGENTS: Dict[str, Tuple[str, ...]] = {
    "google": ("googlebot", "google-inspectiontool", "apis-google"),
    "bing": ("bingbot",),
    "duckduckgo": ("duckduckbot",),
    "yandex": ("yandexbot",),
    "baidu": ("baiduspider",),
    "openai": ("gptbot", "chatgpt-user", "oai-searchbot"),
    "anthropic": ("claudebot", "anthropic-ai"),
    "perplexity": ("perplexitybot",),
    "commoncrawl": ("ccbot",),
    "facebook": ("facebookexternalhit", "facebot"),
    "twitter": ("twitterbot",),
    "linkedin": ("linkedinbot",),
}

DEFAULT_CRAWLER_FAMILIES: Tuple[str, ...] = tuple(_DEFAULT_CRAWLER_USER_AGENTS.keys())


@dataclass
class AccessRequest:
    """Framework-agnostic representation of an inbound request."""

    headers: Mapping[str, str] = field(default_factory=dict)
    pathname: str = "/"
    remote_addr: Optional[str] = None
    method: str = "GET"

    def header(self, name: str) -> Optional[str]:
        if not self.headers:
            return None
        lower = name.lower()
        for key, value in self.headers.items():
            if key.lower() == lower:
                return value
        return None


@dataclass
class CrawlerPolicy:
    enabled: bool = False
    families: Optional[Tuple[str, ...]] = None
    family_cidrs: Dict[str, Tuple[str, ...]] = field(default_factory=dict)
    user_agents: Optional[Dict[str, Tuple[str, ...]]] = None
    allow_cloudflare_verified_bot: bool = False
    reverse_dns_verifier: Optional[Callable[[str, str], Union[bool, Awaitable[bool]]]] = None


BeforeProtectFn = Callable[[AccessRequest], Union["AccessDecision", str, Awaitable[Union["AccessDecision", str]]]]


@dataclass
class AccessPolicyOptions:
    trusted_ip_headers: Tuple[str, ...] = ()
    allow_cidrs: Tuple[str, ...] = ()
    crawler: Optional[CrawlerPolicy] = None
    before_protect: Optional[BeforeProtectFn] = None


@dataclass
class AccessDecision:
    action: str  # "allow" | "continue" | "redirect"
    reason: Optional[str] = None
    redirect_url: Optional[str] = None


@dataclass
class CrawlerVerification:
    verified: bool
    reason: str
    family: Optional[str] = None


def _first_header_value(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    head = value.split(",", 1)[0].strip()
    return head or None


def get_client_ip(request: AccessRequest, trusted_ip_headers: Tuple[str, ...] = ()) -> Optional[str]:
    """Resolve the client IP from configured trusted headers, then ``remote_addr``."""

    for header_name in trusted_ip_headers:
        value = _first_header_value(request.header(header_name))
        if value:
            return value
    return request.remote_addr or None


_BOOL_TRUE = {"1", "true", "yes", "on"}


def _parse_bool_header(value: Optional[str]) -> bool:
    return (value or "").strip().lower() in _BOOL_TRUE


def ip_in_cidrs(ip: str, cidrs) -> bool:
    """Return True if ``ip`` is inside any CIDR in ``cidrs`` (IPv4 + IPv6)."""

    if not ip:
        return False
    try:
        addr = ipaddress.ip_address(ip.strip())
    except ValueError:
        return False

    for cidr in cidrs or ():
        try:
            network = ipaddress.ip_network(cidr, strict=False)
        except ValueError:
            continue
        if addr.version != network.version:
            continue
        if addr in network:
            return True
    return False


def _detect_crawler_family(
    user_agent: str,
    families: Tuple[str, ...],
    user_agent_map: Dict[str, Tuple[str, ...]],
) -> Optional[str]:
    if not user_agent:
        return None
    needle = user_agent.lower()
    for family in families:
        for fragment in user_agent_map.get(family, ()):  # type: ignore[union-attr]
            if fragment and fragment.lower() in needle:
                return family
    return None


def _verify_crawler_sync(
    *,
    ip: Optional[str],
    user_agent: str,
    cloudflare_verified_bot: bool,
    crawler: Optional[CrawlerPolicy],
) -> Tuple[CrawlerVerification, Optional[Callable[[], Union[bool, Awaitable[bool]]]]]:
    """Return verification result + a deferred rDNS callable, if any.

    The rDNS callable is only returned when sync verification ended in
    ``ip_not_verified`` and the policy provides a verifier we should consult.
    """

    if not crawler or not crawler.enabled:
        return CrawlerVerification(False, "disabled"), None

    families = crawler.families or DEFAULT_CRAWLER_FAMILIES
    user_agent_map = crawler.user_agents or _DEFAULT_CRAWLER_USER_AGENTS

    family = _detect_crawler_family(user_agent or "", families, user_agent_map)
    if family is None:
        return CrawlerVerification(False, "no_family_match"), None

    if not ip:
        return CrawlerVerification(False, "missing_ip", family), None

    if crawler.allow_cloudflare_verified_bot and cloudflare_verified_bot:
        return CrawlerVerification(True, "cloudflare_verified_bot", family), None

    if ip_in_cidrs(ip, crawler.family_cidrs.get(family, ())):
        return CrawlerVerification(True, "cidr_match", family), None

    verifier = crawler.reverse_dns_verifier
    if verifier is not None:
        def _call() -> Union[bool, Awaitable[bool]]:
            return verifier(ip, family)  # type: ignore[misc]

        return CrawlerVerification(False, "ip_not_verified", family), _call

    return CrawlerVerification(False, "ip_not_verified", family), None


def verify_crawler_request(
    *,
    ip: Optional[str],
    user_agent: str,
    cloudflare_verified_bot: bool = False,
    crawler: Optional[CrawlerPolicy] = None,
) -> CrawlerVerification:
    """Synchronous crawler verification (rDNS callbacks are required to be sync)."""

    result, deferred = _verify_crawler_sync(
        ip=ip,
        user_agent=user_agent,
        cloudflare_verified_bot=cloudflare_verified_bot,
        crawler=crawler,
    )
    if deferred is None:
        return result

    outcome = deferred()
    if _is_awaitable(outcome):
        raise RuntimeError(
            "reverse_dns_verifier returned a coroutine; use verify_crawler_request_async() instead"
        )
    if outcome:
        assert result.family is not None
        return CrawlerVerification(True, "reverse_dns_match", result.family)
    return result


async def verify_crawler_request_async(
    *,
    ip: Optional[str],
    user_agent: str,
    cloudflare_verified_bot: bool = False,
    crawler: Optional[CrawlerPolicy] = None,
) -> CrawlerVerification:
    result, deferred = _verify_crawler_sync(
        ip=ip,
        user_agent=user_agent,
        cloudflare_verified_bot=cloudflare_verified_bot,
        crawler=crawler,
    )
    if deferred is None:
        return result

    outcome = deferred()
    if _is_awaitable(outcome):
        outcome = await outcome  # type: ignore[assignment]
    if outcome:
        assert result.family is not None
        return CrawlerVerification(True, "reverse_dns_match", result.family)
    return result


def _is_awaitable(value: Any) -> bool:
    return hasattr(value, "__await__")


def _normalize_decision(decision: Union[AccessDecision, str, Mapping[str, Any], None]) -> AccessDecision:
    if decision is None:
        return AccessDecision(action="continue")
    if isinstance(decision, AccessDecision):
        return decision
    if isinstance(decision, str):
        return AccessDecision(action=decision)
    if isinstance(decision, Mapping):
        return AccessDecision(
            action=str(decision.get("action", "continue")),
            reason=decision.get("reason"),
            redirect_url=decision.get("redirect_url") or decision.get("redirectUrl"),
        )
    return AccessDecision(action="continue")


def _resolve_cf_verified_bot(request: AccessRequest) -> bool:
    return _parse_bool_header(
        request.header("cf-verified-bot") or request.header("x-proofmark-cf-verified-bot")
    )


def evaluate_access_policy(
    request: AccessRequest,
    options: Optional[AccessPolicyOptions] = None,
) -> AccessDecision:
    options = options or AccessPolicyOptions()
    client_ip = get_client_ip(request, options.trusted_ip_headers)
    user_agent = request.header("user-agent") or ""

    crawler = verify_crawler_request(
        ip=client_ip,
        user_agent=user_agent,
        cloudflare_verified_bot=_resolve_cf_verified_bot(request),
        crawler=options.crawler,
    )
    if crawler.verified:
        return AccessDecision(action="allow", reason=f"crawler:{crawler.family}")

    if client_ip and ip_in_cidrs(client_ip, options.allow_cidrs):
        return AccessDecision(action="allow", reason="cidr_allowlist")

    if options.before_protect is not None:
        decision = options.before_protect(request)
        if _is_awaitable(decision):
            raise RuntimeError(
                "before_protect returned a coroutine; use evaluate_access_policy_async() instead"
            )
        return _normalize_decision(decision)  # type: ignore[arg-type]

    return AccessDecision(action="continue")


async def evaluate_access_policy_async(
    request: AccessRequest,
    options: Optional[AccessPolicyOptions] = None,
) -> AccessDecision:
    options = options or AccessPolicyOptions()
    client_ip = get_client_ip(request, options.trusted_ip_headers)
    user_agent = request.header("user-agent") or ""

    crawler = await verify_crawler_request_async(
        ip=client_ip,
        user_agent=user_agent,
        cloudflare_verified_bot=_resolve_cf_verified_bot(request),
        crawler=options.crawler,
    )
    if crawler.verified:
        return AccessDecision(action="allow", reason=f"crawler:{crawler.family}")

    if client_ip and ip_in_cidrs(client_ip, options.allow_cidrs):
        return AccessDecision(action="allow", reason="cidr_allowlist")

    if options.before_protect is not None:
        decision = options.before_protect(request)
        if _is_awaitable(decision):
            decision = await decision  # type: ignore[assignment]
        return _normalize_decision(decision)  # type: ignore[arg-type]

    return AccessDecision(action="continue")


__all__ = [
    "AccessRequest",
    "AccessPolicyOptions",
    "AccessDecision",
    "CrawlerPolicy",
    "CrawlerVerification",
    "DEFAULT_CRAWLER_FAMILIES",
    "evaluate_access_policy",
    "evaluate_access_policy_async",
    "verify_crawler_request",
    "verify_crawler_request_async",
    "ip_in_cidrs",
    "get_client_ip",
]
