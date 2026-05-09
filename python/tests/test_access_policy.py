from __future__ import annotations

from proofmark_showad.access_policy import (
    AccessPolicyOptions,
    AccessRequest,
    CrawlerPolicy,
    evaluate_access_policy,
    ip_in_cidrs,
    verify_crawler_request,
)


def _request(headers=None, remote_addr=None, pathname="/premium/article"):
    return AccessRequest(
        headers={k.lower(): v for k, v in (headers or {}).items()},
        pathname=pathname,
        remote_addr=remote_addr,
        method="GET",
    )


def test_ipv4_cidr_match():
    assert ip_in_cidrs("203.0.113.42", ["203.0.113.0/24"]) is True
    assert ip_in_cidrs("198.51.100.42", ["203.0.113.0/24"]) is False


def test_ipv6_cidr_match():
    assert ip_in_cidrs("2001:4860:4860::8888", ["2001:4860::/32"]) is True
    assert ip_in_cidrs("2606:4700::1", ["2001:4860::/32"]) is False


def test_ip_not_in_cidrs_when_invalid():
    assert ip_in_cidrs("not-an-ip", ["203.0.113.0/24"]) is False
    assert ip_in_cidrs("203.0.113.1", ["bogus/24"]) is False


def test_user_agent_alone_does_not_grant_bypass():
    result = verify_crawler_request(
        ip="198.51.100.10",
        user_agent="Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        crawler=CrawlerPolicy(
            enabled=True,
            families=("google",),
            family_cidrs={"google": ("66.249.64.0/19",)},
        ),
    )
    assert result.verified is False
    assert result.reason == "ip_not_verified"
    assert result.family == "google"


def test_googlebot_in_known_range_is_verified():
    result = verify_crawler_request(
        ip="66.249.66.1",
        user_agent="Mozilla/5.0 (compatible; Googlebot/2.1)",
        crawler=CrawlerPolicy(
            enabled=True,
            families=("google",),
            family_cidrs={"google": ("66.249.64.0/19",)},
        ),
    )
    assert result.verified is True
    assert result.family == "google"
    assert result.reason == "cidr_match"


def test_disabled_crawler_policy_returns_disabled():
    result = verify_crawler_request(
        ip="66.249.66.1",
        user_agent="Mozilla/5.0 (compatible; Googlebot/2.1)",
        crawler=CrawlerPolicy(enabled=False),
    )
    assert result.verified is False
    assert result.reason == "disabled"


def test_unknown_user_agent_no_match():
    result = verify_crawler_request(
        ip="66.249.66.1",
        user_agent="Mozilla/5.0 (regular browser)",
        crawler=CrawlerPolicy(enabled=True, families=("google",)),
    )
    assert result.verified is False
    assert result.reason == "no_family_match"


def test_cloudflare_verified_bot_short_circuits():
    result = verify_crawler_request(
        ip="66.249.66.1",
        user_agent="Mozilla/5.0 (compatible; Googlebot/2.1)",
        cloudflare_verified_bot=True,
        crawler=CrawlerPolicy(
            enabled=True,
            families=("google",),
            allow_cloudflare_verified_bot=True,
        ),
    )
    assert result.verified is True
    assert result.reason == "cloudflare_verified_bot"


def test_reverse_dns_verifier_is_consulted():
    seen = []

    def rdns(ip, family):
        seen.append((ip, family))
        return True

    result = verify_crawler_request(
        ip="1.2.3.4",
        user_agent="Mozilla/5.0 (compatible; bingbot/2.0)",
        crawler=CrawlerPolicy(
            enabled=True,
            families=("bing",),
            reverse_dns_verifier=rdns,
        ),
    )
    assert result.verified is True
    assert result.reason == "reverse_dns_match"
    assert seen == [("1.2.3.4", "bing")]


def test_evaluate_cidr_allowlist_uses_trusted_header():
    decision = evaluate_access_policy(
        _request(headers={"cf-connecting-ip": "203.0.113.42"}),
        AccessPolicyOptions(
            trusted_ip_headers=("cf-connecting-ip",),
            allow_cidrs=("203.0.113.0/24",),
        ),
    )
    assert decision.action == "allow"
    assert decision.reason == "cidr_allowlist"


def test_evaluate_before_protect_callback_allow():
    def policy(req):
        if req.header("x-publisher-premium") == "1":
            return {"action": "allow", "reason": "premium_user"}
        return "continue"

    decision = evaluate_access_policy(
        _request(headers={"x-publisher-premium": "1"}),
        AccessPolicyOptions(before_protect=policy),
    )
    assert decision.action == "allow"
    assert decision.reason == "premium_user"


def test_evaluate_before_protect_callback_continue():
    def policy(req):
        return "continue"

    decision = evaluate_access_policy(
        _request(),
        AccessPolicyOptions(before_protect=policy),
    )
    assert decision.action == "continue"


def test_evaluate_falls_through_to_continue_without_options():
    decision = evaluate_access_policy(_request())
    assert decision.action == "continue"


def test_uppercase_x_forwarded_for_resolved():
    decision = evaluate_access_policy(
        _request(headers={"X-Forwarded-For": "203.0.113.42, 10.0.0.1"}),
        AccessPolicyOptions(
            trusted_ip_headers=("x-forwarded-for",),
            allow_cidrs=("203.0.113.0/24",),
        ),
    )
    assert decision.action == "allow"
    assert decision.reason == "cidr_allowlist"
