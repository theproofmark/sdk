using System.Net;
using Microsoft.AspNetCore.Http;
using ShowAd.AspNetCore.AccessPolicy;
using Xunit;

namespace ShowAd.AspNetCore.Tests;

public class AccessPolicyEvaluatorTests
{
    private static HttpContext MakeContext(string? userAgent = null, IDictionary<string, string>? headers = null, string? remoteIp = null)
    {
        var ctx = new DefaultHttpContext();
        if (userAgent is not null) ctx.Request.Headers.UserAgent = userAgent;
        if (headers is not null)
        {
            foreach (var kv in headers) ctx.Request.Headers[kv.Key] = kv.Value;
        }
        if (remoteIp is not null) ctx.Connection.RemoteIpAddress = IPAddress.Parse(remoteIp);
        return ctx;
    }

    [Fact]
    public void IpMatchesCidr_handles_ipv4_ranges()
    {
        Assert.True(AccessPolicyEvaluator.IpMatchesCidr("203.0.113.42", "203.0.113.0/24"));
        Assert.False(AccessPolicyEvaluator.IpMatchesCidr("203.0.114.1", "203.0.113.0/24"));
        Assert.True(AccessPolicyEvaluator.IpMatchesCidr("66.249.66.1", "66.249.64.0/19"));
        Assert.False(AccessPolicyEvaluator.IpMatchesCidr("66.250.0.1", "66.249.64.0/19"));
    }

    [Fact]
    public void IpMatchesCidr_handles_exact_match_without_slash()
    {
        Assert.True(AccessPolicyEvaluator.IpMatchesCidr("10.0.0.1", "10.0.0.1"));
        Assert.False(AccessPolicyEvaluator.IpMatchesCidr("10.0.0.2", "10.0.0.1"));
    }

    [Fact]
    public void IpMatchesCidr_handles_ipv6()
    {
        Assert.True(AccessPolicyEvaluator.IpMatchesCidr("2001:db8::1", "2001:db8::/32"));
        Assert.False(AccessPolicyEvaluator.IpMatchesCidr("2002::1", "2001:db8::/32"));
    }

    [Fact]
    public void Crawler_ua_alone_does_not_bypass()
    {
        var ctx = MakeContext(userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
        var eval = new AccessPolicyEvaluator();
        var opts = new AccessPolicyOptions
        {
            Crawler = new CrawlerPolicy
            {
                Enabled = true,
                Families = new List<string> { "google" },
                FamilyCidrs = new Dictionary<string, IList<string>> { ["google"] = new List<string> { "66.249.64.0/19" } },
            },
        };
        var decision = eval.Evaluate(ctx, opts);
        Assert.Equal(AccessPolicyAction.Continue, decision.Action);
    }

    [Fact]
    public void Crawler_with_trusted_ip_in_cidr_bypasses()
    {
        var ctx = MakeContext(
            userAgent: "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
            headers: new Dictionary<string, string> { ["CF-Connecting-IP"] = "66.249.66.1" });
        var eval = new AccessPolicyEvaluator();
        var opts = new AccessPolicyOptions
        {
            TrustedIpHeaders = new List<string> { "CF-Connecting-IP" },
            Crawler = new CrawlerPolicy
            {
                Enabled = true,
                Families = new List<string> { "google" },
                FamilyCidrs = new Dictionary<string, IList<string>> { ["google"] = new List<string> { "66.249.64.0/19" } },
            },
        };
        var decision = eval.Evaluate(ctx, opts);
        Assert.Equal(AccessPolicyAction.Allow, decision.Action);
        Assert.Contains("crawler:google", decision.Reason);
    }

    [Fact]
    public void Cidr_allowlist_bypasses()
    {
        var ctx = MakeContext(headers: new Dictionary<string, string> { ["CF-Connecting-IP"] = "203.0.113.42" });
        var eval = new AccessPolicyEvaluator();
        var opts = new AccessPolicyOptions
        {
            TrustedIpHeaders = new List<string> { "CF-Connecting-IP" },
            AllowCidrs = new List<string> { "203.0.113.0/24" },
        };
        var decision = eval.Evaluate(ctx, opts);
        Assert.Equal(AccessPolicyAction.Allow, decision.Action);
        Assert.Equal("cidr_allowlist", decision.Reason);
    }

    [Fact]
    public void BeforeProtect_callback_can_allow()
    {
        var ctx = MakeContext(headers: new Dictionary<string, string> { ["X-Publisher-Premium"] = "1" });
        var eval = new AccessPolicyEvaluator();
        var opts = new AccessPolicyOptions
        {
            BeforeProtect = (http, _) => http.Request.Headers["X-Publisher-Premium"] == "1"
                ? AccessPolicyDecision.Allow("premium_user")
                : AccessPolicyDecision.Continue(),
        };
        var decision = eval.Evaluate(ctx, opts);
        Assert.Equal(AccessPolicyAction.Allow, decision.Action);
        Assert.Equal("premium_user", decision.Reason);
    }

    [Fact]
    public void Cloudflare_verified_bot_signal_bypasses()
    {
        var ctx = MakeContext(
            userAgent: "GPTBot",
            headers: new Dictionary<string, string>
            {
                ["CF-Connecting-IP"] = "1.2.3.4",
                ["CF-Verified-Bot"] = "true",
            });
        var eval = new AccessPolicyEvaluator();
        var opts = new AccessPolicyOptions
        {
            TrustedIpHeaders = new List<string> { "CF-Connecting-IP" },
            Crawler = new CrawlerPolicy
            {
                Enabled = true,
                Families = new List<string> { "openai" },
                AllowCloudflareVerifiedBot = true,
            },
        };
        var decision = eval.Evaluate(ctx, opts);
        Assert.Equal(AccessPolicyAction.Allow, decision.Action);
    }
}
