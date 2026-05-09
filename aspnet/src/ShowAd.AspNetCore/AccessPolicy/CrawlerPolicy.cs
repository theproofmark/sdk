using Microsoft.AspNetCore.Http;

namespace ShowAd.AspNetCore.AccessPolicy;

public delegate bool ReverseDnsVerifier(string ip, string family);

public class CrawlerPolicy
{
    public bool Enabled { get; set; }

    /// <summary>Restrict to a subset of families. Null = all known families.</summary>
    public IList<string>? Families { get; set; }

    /// <summary>Override default UA fragments per family (lowercase substrings).</summary>
    public IDictionary<string, IList<string>>? UserAgents { get; set; }

    /// <summary>CIDR ranges per family for IP verification.</summary>
    public IDictionary<string, IList<string>> FamilyCidrs { get; set; } = new Dictionary<string, IList<string>>(StringComparer.OrdinalIgnoreCase);

    /// <summary>Trust the Cloudflare verified-bot signal (CF-Verified-Bot header).</summary>
    public bool AllowCloudflareVerifiedBot { get; set; }

    /// <summary>Optional callback for reverse-DNS verification.</summary>
    public ReverseDnsVerifier? ReverseDnsVerifier { get; set; }

    /// <summary>Default crawler UA fragments per family. UA alone never bypasses.</summary>
    public static readonly IReadOnlyDictionary<string, IReadOnlyList<string>> DefaultUserAgents =
        new Dictionary<string, IReadOnlyList<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["google"] = new[] { "googlebot", "google-inspectiontool", "apis-google" },
            ["bing"] = new[] { "bingbot" },
            ["duckduckgo"] = new[] { "duckduckbot" },
            ["yandex"] = new[] { "yandexbot" },
            ["baidu"] = new[] { "baiduspider" },
            ["openai"] = new[] { "gptbot", "chatgpt-user", "oai-searchbot" },
            ["anthropic"] = new[] { "claudebot", "anthropic-ai" },
            ["perplexity"] = new[] { "perplexitybot" },
            ["commoncrawl"] = new[] { "ccbot" },
            ["facebook"] = new[] { "facebookexternalhit", "facebot" },
            ["twitter"] = new[] { "twitterbot" },
            ["linkedin"] = new[] { "linkedinbot" },
        };
}

public class AccessPolicyOptions
{
    /// <summary>Trusted edge headers carrying the real client IP.</summary>
    public IList<string> TrustedIpHeaders { get; set; } = new List<string>();

    /// <summary>CIDR allowlist evaluated against the resolved client IP.</summary>
    public IList<string> AllowCidrs { get; set; } = new List<string>();

    /// <summary>Verified-crawler policy. UA alone never bypasses.</summary>
    public CrawlerPolicy? Crawler { get; set; }

    /// <summary>Publisher callback (premium users, app sessions, ...).</summary>
    public Func<HttpContext, AccessPolicyContext, AccessPolicyDecision>? BeforeProtect { get; set; }
}

public sealed class AccessPolicyContext
{
    public string? ClientIp { get; init; }
    public string UserAgent { get; init; } = string.Empty;
}

public enum AccessPolicyAction { Continue, Allow, Redirect }

public sealed class AccessPolicyDecision
{
    public AccessPolicyAction Action { get; init; } = AccessPolicyAction.Continue;
    public string? Reason { get; init; }
    public string? RedirectUrl { get; init; }

    public static AccessPolicyDecision Continue(string? reason = null) =>
        new() { Action = AccessPolicyAction.Continue, Reason = reason };

    public static AccessPolicyDecision Allow(string? reason = null) =>
        new() { Action = AccessPolicyAction.Allow, Reason = reason };

    public static AccessPolicyDecision Redirect(string? url = null, string? reason = null) =>
        new() { Action = AccessPolicyAction.Redirect, Reason = reason, RedirectUrl = url };
}
