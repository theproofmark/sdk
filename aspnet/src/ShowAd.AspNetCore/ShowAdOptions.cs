using ShowAd.AspNetCore.AccessPolicy;

namespace ShowAd.AspNetCore;

/// <summary>
/// Configuration options for the ShowAd middleware.
/// </summary>
public class ShowAdOptions
{
    public const string DefaultApiBaseUrl = "https://ad.proofmark.io";
    public const string DefaultVideoAdUrl = "https://showad.proofmark.io";
    public const string DefaultCookiePrefix = "showad";
    public const int DefaultCookieMaxAgeSeconds = 3600;

    /// <summary>Creator hash issued by the ShowAd dashboard.</summary>
    public string CreatorHash { get; set; } = string.Empty;

    /// <summary>Secret API key (must never reach the client).</summary>
    public string ApiKey { get; set; } = string.Empty;

    /// <summary>Secret used to claim redirect tickets from the backend.</summary>
    public string RedirectSecret { get; set; } = string.Empty;

    /// <summary>Backend API base URL.</summary>
    public string ApiBaseUrl { get; set; } = DefaultApiBaseUrl;

    /// <summary>Video-ad frontend base URL.</summary>
    public string VideoAdUrl { get; set; } = DefaultVideoAdUrl;

    /// <summary>Cookie name prefix (default <c>showad</c>).</summary>
    public string CookiePrefix { get; set; } = DefaultCookiePrefix;

    /// <summary>Cookie max age in seconds.</summary>
    public int CookieMaxAgeSeconds { get; set; } = DefaultCookieMaxAgeSeconds;

    /// <summary>If null, secure flag is auto-detected from request scheme.</summary>
    public bool? CookieSecure { get; set; }

    /// <summary>SameSite mode for cookies. Default <c>Lax</c>.</summary>
    public Microsoft.AspNetCore.Http.SameSiteMode CookieSameSite { get; set; }
        = Microsoft.AspNetCore.Http.SameSiteMode.Lax;

    /// <summary>Glob patterns to protect (e.g. <c>premium/*</c>).</summary>
    public IList<string> ProtectedPaths { get; set; } = new List<string>();

    /// <summary>Glob patterns to exclude even if protected.</summary>
    public IList<string> ExcludedPaths { get; set; } = new List<string>();

    /// <summary>Server-only access policy evaluated before redirecting.</summary>
    public AccessPolicyOptions? AccessPolicy { get; set; }

    /// <summary>Verbose logging.</summary>
    public bool Debug { get; set; }

    /// <summary>HTTP client timeout for backend calls.</summary>
    public TimeSpan HttpTimeout { get; set; } = TimeSpan.FromSeconds(10);

    internal void Validate()
    {
        if (string.IsNullOrWhiteSpace(CreatorHash))
            throw new ArgumentException("ShowAdOptions.CreatorHash is required.");
        if (string.IsNullOrWhiteSpace(ApiKey))
            throw new ArgumentException("ShowAdOptions.ApiKey is required.");
        if (string.IsNullOrWhiteSpace(RedirectSecret))
            throw new ArgumentException("ShowAdOptions.RedirectSecret is required.");
    }
}
