using Microsoft.AspNetCore.Http;
using ShowAd.AspNetCore.Jwt;

namespace ShowAd.AspNetCore.Cookies;

/// <summary>Reads and writes ShowAd cookies on an <see cref="HttpContext"/>.</summary>
public sealed class CookieJar
{
    private readonly ShowAdOptions _options;

    public CookieJar(ShowAdOptions options) => _options = options;

    public string Name(string suffix) => CookieNames.Build(_options.CookiePrefix, suffix);

    public string? Read(HttpRequest request, string suffix) =>
        request.Cookies.TryGetValue(Name(suffix), out var v) ? v : null;

    public sealed record VerificationData(string Token, string CreatorHash, string? TicketId);

    public void SetVerification(HttpContext context, VerificationData data)
    {
        var maxAge = TimeSpan.FromSeconds(_options.CookieMaxAgeSeconds);
        var secure = _options.CookieSecure ?? context.Request.IsHttps;

        var sharedOpts = new CookieOptions
        {
            Path = "/",
            HttpOnly = false,
            Secure = secure,
            SameSite = _options.CookieSameSite,
            MaxAge = maxAge,
        };

        var tokenOpts = new CookieOptions
        {
            Path = "/",
            HttpOnly = true,
            Secure = secure,
            SameSite = _options.CookieSameSite,
            MaxAge = maxAge,
        };

        context.Response.Cookies.Append(Name(CookieNames.Token), data.Token, tokenOpts);
        context.Response.Cookies.Append(Name(CookieNames.Verified), "1", sharedOpts);
        context.Response.Cookies.Append(Name(CookieNames.Creator), data.CreatorHash, sharedOpts);

        if (!string.IsNullOrEmpty(data.TicketId))
            context.Response.Cookies.Append(Name(CookieNames.Ticket), data.TicketId!, sharedOpts);

        var expiry = JwtHelper.GetTokenExpiry(data.Token);
        if (expiry.HasValue)
            context.Response.Cookies.Append(Name(CookieNames.Expires), expiry.Value.ToString(), sharedOpts);
    }

    public void ClearVerification(HttpContext context)
    {
        var secure = _options.CookieSecure ?? context.Request.IsHttps;

        var baseOpts = new CookieOptions
        {
            Path = "/",
            Secure = secure,
            SameSite = _options.CookieSameSite,
        };

        foreach (var (suffix, httpOnly) in new[]
                 {
                     (CookieNames.Token, true),
                     (CookieNames.Verified, false),
                     (CookieNames.Creator, false),
                     (CookieNames.Ticket, false),
                     (CookieNames.Expires, false),
                 })
        {
            var opts = new CookieOptions
            {
                Path = baseOpts.Path,
                Secure = baseOpts.Secure,
                SameSite = baseOpts.SameSite,
                HttpOnly = httpOnly,
            };
            context.Response.Cookies.Delete(Name(suffix), opts);
        }
    }
}
