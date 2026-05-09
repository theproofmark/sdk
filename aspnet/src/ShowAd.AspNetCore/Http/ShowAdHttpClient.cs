using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.Extensions.Options;
using ShowAd.AspNetCore.Errors;

namespace ShowAd.AspNetCore.Http;

public sealed class ShowAdHttpClient : IShowAdHttpClient
{
    public const string ClientName = "ShowAd";

    private readonly HttpClient _http;
    private readonly ShowAdOptions _options;

    public ShowAdHttpClient(HttpClient http, IOptions<ShowAdOptions> options)
    {
        _http = http;
        _options = options.Value;
        if (_http.Timeout == TimeSpan.FromSeconds(100))
            _http.Timeout = _options.HttpTimeout;
    }

    public async Task<TicketClaimResult> ClaimRedirectTicketAsync(string ticketId, CancellationToken ct = default)
    {
        var baseUrl = _options.ApiBaseUrl.TrimEnd('/');
        var url = $"{baseUrl}/api/redirect-ticket/{Uri.EscapeDataString(ticketId)}/claim";

        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Add("X-Redirect-Ticket-Secret", _options.RedirectSecret);
        req.Headers.Add("X-ShowAd-API-Key", _options.ApiKey);
        req.Headers.Add("X-ShowAd-Creator-Hash", _options.CreatorHash);
        req.Content = JsonContent.Create(new { creator_hash = _options.CreatorHash });

        HttpResponseMessage resp;
        try { resp = await _http.SendAsync(req, ct).ConfigureAwait(false); }
        catch (HttpRequestException ex)
        {
            throw new ShowAdException("Network error claiming ticket: " + ex.Message, ShowAdErrorCode.NetworkError, ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new ShowAdException("Timeout claiming ticket", ShowAdErrorCode.NetworkError, ex);
        }

        using (resp)
        {
            if (!resp.IsSuccessStatusCode)
            {
                throw resp.StatusCode switch
                {
                    HttpStatusCode.Gone => new ShowAdException("Redirect ticket not found or already consumed", ShowAdErrorCode.TicketNotFound),
                    HttpStatusCode.Unauthorized => new ShowAdException("Invalid redirect ticket secret", ShowAdErrorCode.TicketClaimFailed),
                    HttpStatusCode.Forbidden => new ShowAdException("Creator hash does not match ticket", ShowAdErrorCode.CreatorMismatch),
                    _ => new ShowAdException($"Failed to claim redirect ticket (HTTP {(int)resp.StatusCode})", ShowAdErrorCode.NetworkError),
                };
            }

            using var stream = await resp.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
            using var doc = await JsonDocument.ParseAsync(stream, default, ct).ConfigureAwait(false);
            var root = doc.RootElement;

            var token = root.TryGetProperty("token", out var t) && t.ValueKind == JsonValueKind.String ? t.GetString() : null;
            var creator = root.TryGetProperty("creator_hash", out var c) && c.ValueKind == JsonValueKind.String ? c.GetString() : null;
            var ticket = root.TryGetProperty("ticket_id", out var ti) && ti.ValueKind == JsonValueKind.String ? ti.GetString() : null;

            if (string.IsNullOrEmpty(token) || string.IsNullOrEmpty(creator))
                throw new ShowAdException("Invalid ticket claim response from ShowAd backend", ShowAdErrorCode.TicketClaimFailed);

            return new TicketClaimResult { Token = token!, CreatorHash = creator!, TicketId = ticket };
        }
    }

    public async Task<ValidateTokenResult> ValidateTokenAsync(string token, CancellationToken ct = default)
    {
        var baseUrl = _options.ApiBaseUrl.TrimEnd('/');
        var url = $"{baseUrl}/api/sdk/validate";

        using var req = new HttpRequestMessage(HttpMethod.Post, url);
        req.Headers.Add("X-ShowAd-API-Key", _options.ApiKey);
        req.Headers.Add("X-ShowAd-Creator-Hash", _options.CreatorHash);
        req.Content = JsonContent.Create(new { token, sdk_key = _options.ApiKey });

        HttpResponseMessage resp;
        try { resp = await _http.SendAsync(req, ct).ConfigureAwait(false); }
        catch (HttpRequestException ex)
        {
            throw new ShowAdException("Network error validating token: " + ex.Message, ShowAdErrorCode.NetworkError, ex);
        }
        catch (TaskCanceledException ex)
        {
            throw new ShowAdException("Timeout validating token", ShowAdErrorCode.NetworkError, ex);
        }

        using (resp)
        {
            if (!resp.IsSuccessStatusCode)
                throw new ShowAdException($"Failed to validate token (HTTP {(int)resp.StatusCode})", ShowAdErrorCode.TokenInvalid);

            using var stream = await resp.Content.ReadAsStreamAsync(ct).ConfigureAwait(false);
            JsonDocument doc;
            try
            {
                doc = await JsonDocument.ParseAsync(stream, default, ct).ConfigureAwait(false);
            }
            catch (JsonException ex)
            {
                throw new ShowAdException("Invalid token validation response from ShowAd backend", ShowAdErrorCode.TokenInvalid, ex);
            }
            using (doc)
            {
                var root = doc.RootElement;
                var valid = root.TryGetProperty("valid", out var v) && v.ValueKind == JsonValueKind.True;
                var message = root.TryGetProperty("message", out var m) && m.ValueKind == JsonValueKind.String ? m.GetString() : null;
                return new ValidateTokenResult { Valid = valid, Message = message };
            }
        }
    }
}
