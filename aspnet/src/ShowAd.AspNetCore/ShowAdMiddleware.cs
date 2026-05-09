using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Http.Extensions;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ShowAd.AspNetCore.AccessPolicy;
using ShowAd.AspNetCore.Cookies;
using ShowAd.AspNetCore.Errors;
using ShowAd.AspNetCore.Http;
using ShowAd.AspNetCore.Jwt;
using ShowAd.AspNetCore.PathMatching;
using ShowAd.AspNetCore.Url;

namespace ShowAd.AspNetCore;

/// <summary>
/// Verifies ShowAd access. Pipeline: path match → access policy → ticket claim
/// → token validate → redirect to video ad.
/// </summary>
public sealed class ShowAdMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ShowAdOptions _options;
    private readonly IShowAdHttpClient _httpClient;
    private readonly AccessPolicyEvaluator _accessPolicyEvaluator;
    private readonly CookieJar _cookies;
    private readonly ILogger<ShowAdMiddleware> _logger;

    public ShowAdMiddleware(
        RequestDelegate next,
        IOptions<ShowAdOptions> options,
        IShowAdHttpClient httpClient,
        AccessPolicyEvaluator accessPolicyEvaluator,
        ILogger<ShowAdMiddleware> logger)
    {
        _next = next;
        _options = options.Value;
        _httpClient = httpClient;
        _accessPolicyEvaluator = accessPolicyEvaluator;
        _logger = logger;
        _cookies = new CookieJar(_options);
    }

    public async Task InvokeAsync(HttpContext context)
    {
        var path = context.Request.Path.HasValue ? context.Request.Path.Value! : "/";

        if (PathMatcher.MatchesAny(path, _options.ExcludedPaths))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        if (_options.ProtectedPaths.Count > 0 && !PathMatcher.MatchesAny(path, _options.ProtectedPaths))
        {
            await _next(context).ConfigureAwait(false);
            return;
        }

        Debug("Processing protected path: {Path}", path);

        if (_options.AccessPolicy is not null)
        {
            var decision = _accessPolicyEvaluator.Evaluate(context, _options.AccessPolicy);
            switch (decision.Action)
            {
                case AccessPolicyAction.Allow:
                    Debug("Access policy bypass: {Reason}", decision.Reason ?? "unknown");
                    await _next(context).ConfigureAwait(false);
                    return;
                case AccessPolicyAction.Redirect:
                    Debug("Access policy redirect: {Reason}", decision.Reason ?? "unknown");
                    var target = decision.RedirectUrl ?? RedirectUrlBuilder.BuildVideoAdRedirectUrl(_options.VideoAdUrl, _options.CreatorHash, RedirectUrlBuilder.GetCurrentUrl(context.Request));
                    Redirect(context, target, clearCookies: true);
                    return;
            }
        }

        var fingerprint = _cookies.Read(context.Request, CookieNames.Fingerprint);
        var existingToken = _cookies.Read(context.Request, CookieNames.Token);
        var storedCreator = _cookies.Read(context.Request, CookieNames.Creator);
        var existingVerified = _cookies.Read(context.Request, CookieNames.Verified);
        var existingExpires = _cookies.Read(context.Request, CookieNames.Expires);
        var redirectTicket = context.Request.Query.TryGetValue("redirect_ticket", out var rt) ? rt.ToString() : null;

        if (!string.IsNullOrEmpty(redirectTicket))
        {
            await HandleRedirectTicketAsync(context, redirectTicket!, fingerprint).ConfigureAwait(false);
            return;
        }

        if (!string.IsNullOrEmpty(existingToken))
        {
            await HandleExistingTokenAsync(context, existingToken!, fingerprint, storedCreator, existingVerified, existingExpires).ConfigureAwait(false);
            return;
        }

        Debug("No verification found - redirecting to video ad");
        RedirectToVideoAd(context);
    }

    private async Task HandleRedirectTicketAsync(HttpContext context, string ticketId, string? fingerprint)
    {
        Debug("Found redirect ticket: {TicketId}", ticketId);

        try
        {
            var claim = await _httpClient.ClaimRedirectTicketAsync(ticketId, context.RequestAborted).ConfigureAwait(false);

            if (string.IsNullOrEmpty(claim.Token))
            {
                Debug("Ticket claim missing token");
                RedirectToVideoAd(context);
                return;
            }

            if (!string.Equals(claim.CreatorHash, _options.CreatorHash, StringComparison.Ordinal))
            {
                Debug("Creator hash mismatch on ticket claim");
                RedirectToVideoAd(context);
                return;
            }

            var current = RedirectUrlBuilder.GetCurrentUrl(context.Request);
            var clean = RedirectUrlBuilder.RemoveQueryParam(current, "redirect_ticket");

            _cookies.SetVerification(context, new CookieJar.VerificationData(claim.Token, claim.CreatorHash, claim.TicketId ?? ticketId));

            context.Response.Redirect(clean);
            Debug("Token cookie set, redirecting to clean URL");
            _ = fingerprint;
        }
        catch (ShowAdException ex)
        {
            Debug("Ticket claim failed: {Message}", ex.Message);
            RedirectToVideoAd(context);
        }
    }

    private async Task HandleExistingTokenAsync(HttpContext context, string token, string? fingerprint, string? storedCreator, string? existingVerified, string? existingExpires)
    {
        Debug("Checking existing token");

        if (JwtHelper.IsTokenExpired(token))
        {
            Debug("Token expired");
            RedirectToVideoAd(context);
            return;
        }

        var validation = JwtHelper.ValidateTokenClaims(token, _options.CreatorHash, fingerprint);
        if (!validation.Valid)
        {
            Debug("Token validation failed: {Reason}", validation.Reason ?? "unknown");
            RedirectToVideoAd(context);
            return;
        }

        try
        {
            var backendValidation = await _httpClient.ValidateTokenAsync(token, context.RequestAborted).ConfigureAwait(false);
            if (!backendValidation.Valid)
            {
                Debug("Backend token validation rejected token: {Message}", backendValidation.Message ?? "invalid");
                RedirectToVideoAd(context);
                return;
            }
        }
        catch (Exception ex)
        {
            Debug("Backend token validation failed: {Message}", ex.Message);
            RedirectToVideoAd(context);
            return;
        }

        Debug("Token valid - allowing access");

        var expiry = JwtHelper.GetTokenExpiry(token);
        var needsRefresh =
            existingVerified != "1"
            || !string.Equals(storedCreator, _options.CreatorHash, StringComparison.Ordinal)
            || (expiry.HasValue && existingExpires != expiry.Value.ToString());

        if (needsRefresh)
        {
            var ticket = _cookies.Read(context.Request, CookieNames.Ticket);
            _cookies.SetVerification(context, new CookieJar.VerificationData(token, _options.CreatorHash, ticket));
        }

        await _next(context).ConfigureAwait(false);
    }

    private void RedirectToVideoAd(HttpContext context)
    {
        var current = RedirectUrlBuilder.GetCurrentUrl(context.Request);
        var redirectUrl = RedirectUrlBuilder.BuildVideoAdRedirectUrl(_options.VideoAdUrl, _options.CreatorHash, current);
        Redirect(context, redirectUrl, clearCookies: true);
    }

    private void Redirect(HttpContext context, string url, bool clearCookies)
    {
        if (clearCookies) _cookies.ClearVerification(context);
        context.Response.Redirect(url);
    }

    private void Debug(string message, params object?[] args)
    {
        if (_options.Debug) _logger.LogInformation("[ShowAd] " + message, args);
    }
}
