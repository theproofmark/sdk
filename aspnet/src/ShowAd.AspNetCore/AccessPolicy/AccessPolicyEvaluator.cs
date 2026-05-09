using System.Net;
using Microsoft.AspNetCore.Http;

namespace ShowAd.AspNetCore.AccessPolicy;

public sealed class CrawlerVerificationResult
{
    public bool Verified { get; init; }
    public string Reason { get; init; } = string.Empty;
    public string? Family { get; init; }
}

/// <summary>
/// Pure access-policy evaluator. UA alone never bypasses; verified-crawler
/// requires a UA family match plus IP/CF/rDNS evidence.
/// </summary>
public sealed class AccessPolicyEvaluator
{
    public AccessPolicyDecision Evaluate(HttpContext context, AccessPolicyOptions options)
    {
        var clientIp = ResolveClientIp(context, options.TrustedIpHeaders);
        var userAgent = context.Request.Headers.UserAgent.ToString() ?? string.Empty;

        var crawler = VerifyCrawler(clientIp, userAgent, options.Crawler, context);
        if (crawler.Verified)
        {
            return AccessPolicyDecision.Allow($"crawler:{crawler.Family ?? "unknown"}");
        }

        if (!string.IsNullOrEmpty(clientIp) && IpInCidrs(clientIp!, options.AllowCidrs))
        {
            return AccessPolicyDecision.Allow("cidr_allowlist");
        }

        if (options.BeforeProtect is not null)
        {
            var ctx = new AccessPolicyContext
            {
                ClientIp = clientIp,
                UserAgent = userAgent,
            };
            return options.BeforeProtect(context, ctx) ?? AccessPolicyDecision.Continue();
        }

        return AccessPolicyDecision.Continue();
    }

    public string? ResolveClientIp(HttpContext context, IList<string> trustedHeaders)
    {
        foreach (var header in trustedHeaders)
        {
            if (!context.Request.Headers.TryGetValue(header, out var values)) continue;
            var raw = values.ToString();
            if (string.IsNullOrEmpty(raw)) continue;
            var first = raw.Split(',')[0].Trim();
            if (!string.IsNullOrEmpty(first)) return first;
        }
        return context.Connection.RemoteIpAddress?.ToString();
    }

    public CrawlerVerificationResult VerifyCrawler(string? ip, string userAgent, CrawlerPolicy? policy, HttpContext? context = null)
    {
        if (policy is null || !policy.Enabled)
            return new CrawlerVerificationResult { Verified = false, Reason = "disabled" };

        var families = policy.Families ?? CrawlerPolicy.DefaultUserAgents.Keys.ToList();
        var family = MatchFamily(userAgent, families, policy.UserAgents);
        if (family is null)
            return new CrawlerVerificationResult { Verified = false, Reason = "no_family_match" };

        if (string.IsNullOrEmpty(ip))
            return new CrawlerVerificationResult { Verified = false, Reason = "missing_ip", Family = family };

        if (policy.AllowCloudflareVerifiedBot && context is not null)
        {
            var raw = context.Request.Headers["CF-Verified-Bot"].ToString();
            if (string.IsNullOrEmpty(raw))
                raw = context.Request.Headers["X-ProofMark-CF-Verified-Bot"].ToString();
            if (IsTruthy(raw))
                return new CrawlerVerificationResult { Verified = true, Reason = "cloudflare_verified_bot", Family = family };
        }

        if (policy.FamilyCidrs.TryGetValue(family, out var cidrs) && IpInCidrs(ip!, cidrs))
            return new CrawlerVerificationResult { Verified = true, Reason = "cidr_match", Family = family };

        if (policy.ReverseDnsVerifier is not null && policy.ReverseDnsVerifier(ip!, family))
            return new CrawlerVerificationResult { Verified = true, Reason = "reverse_dns_match", Family = family };

        return new CrawlerVerificationResult { Verified = false, Reason = "ip_not_verified", Family = family };
    }

    public bool IpInCidrs(string ip, IEnumerable<string> cidrs)
    {
        foreach (var cidr in cidrs)
        {
            if (IpMatchesCidr(ip, cidr)) return true;
        }
        return false;
    }

    private static string? MatchFamily(string userAgent, IEnumerable<string> families, IDictionary<string, IList<string>>? overrides)
    {
        if (string.IsNullOrEmpty(userAgent)) return null;
        var needle = userAgent.ToLowerInvariant();

        foreach (var family in families)
        {
            IEnumerable<string>? fragments = null;
            if (overrides is not null && overrides.TryGetValue(family, out var ov)) fragments = ov;
            else if (CrawlerPolicy.DefaultUserAgents.TryGetValue(family, out var def)) fragments = def;
            if (fragments is null) continue;

            foreach (var frag in fragments)
            {
                if (string.IsNullOrEmpty(frag)) continue;
                if (needle.Contains(frag.ToLowerInvariant(), StringComparison.Ordinal))
                    return family;
            }
        }
        return null;
    }

    private static bool IsTruthy(string? value)
    {
        if (string.IsNullOrEmpty(value)) return false;
        var v = value.Trim().ToLowerInvariant();
        return v is "1" or "true" or "yes" or "on";
    }

    public static bool IpMatchesCidr(string ip, string cidr)
    {
        if (!IPAddress.TryParse(ip, out var ipAddr)) return false;

        var slash = cidr.IndexOf('/');
        if (slash < 0)
            return IPAddress.TryParse(cidr, out var single) && single.GetAddressBytes().AsSpan().SequenceEqual(ipAddr.GetAddressBytes());

        var rangeStr = cidr.Substring(0, slash);
        var bitsStr = cidr.Substring(slash + 1);

        if (!IPAddress.TryParse(rangeStr, out var rangeAddr)) return false;
        if (!int.TryParse(bitsStr, out var bits)) return false;

        var ipBytes = ipAddr.GetAddressBytes();
        var rangeBytes = rangeAddr.GetAddressBytes();
        if (ipBytes.Length != rangeBytes.Length) return false;

        var maxBits = ipBytes.Length * 8;
        if (bits < 0 || bits > maxBits) return false;

        var fullBytes = bits / 8;
        var remainder = bits % 8;

        for (var i = 0; i < fullBytes; i++)
        {
            if (ipBytes[i] != rangeBytes[i]) return false;
        }

        if (remainder == 0) return true;

        var mask = (byte)(0xFF << (8 - remainder));
        return (ipBytes[fullBytes] & mask) == (rangeBytes[fullBytes] & mask);
    }
}
