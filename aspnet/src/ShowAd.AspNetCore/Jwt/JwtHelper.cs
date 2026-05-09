using System.Text;
using System.Text.Json;

namespace ShowAd.AspNetCore.Jwt;

/// <summary>
/// Minimal JWT decoder. The backend handles signature verification; this
/// helper only inspects payload claims (exp, nbf, creator_hash, fingerprint, iss).
/// </summary>
public static class JwtHelper
{
    public readonly record struct ValidationResult(bool Valid, string? Reason);

    public static IReadOnlyDictionary<string, JsonElement>? DecodeToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var parts = token.Split('.');
        if (parts.Length != 3) return null;

        byte[] payload;
        try { payload = Base64UrlDecode(parts[1]); }
        catch { return null; }

        try
        {
            using var doc = JsonDocument.Parse(payload);
            if (doc.RootElement.ValueKind != JsonValueKind.Object) return null;
            var dict = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
            foreach (var p in doc.RootElement.EnumerateObject())
            {
                dict[p.Name] = p.Value.Clone();
            }
            return dict;
        }
        catch (JsonException)
        {
            return null;
        }
    }

    public static bool IsTokenExpired(string? token, DateTimeOffset? now = null)
    {
        var claims = DecodeToken(token);
        if (claims is null) return true;

        var nowSec = (now ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds();

        if (claims.TryGetValue("exp", out var exp) && TryGetLong(exp, out var expVal) && expVal < nowSec)
            return true;

        if (claims.TryGetValue("nbf", out var nbf) && TryGetLong(nbf, out var nbfVal) && nbfVal > nowSec)
            return true;

        return false;
    }

    /// <summary>Returns expiry in milliseconds, or null when missing.</summary>
    public static long? GetTokenExpiry(string? token)
    {
        var claims = DecodeToken(token);
        if (claims is null) return null;
        if (!claims.TryGetValue("exp", out var exp)) return null;
        return TryGetLong(exp, out var v) ? v * 1000 : null;
    }

    public static ValidationResult ValidateTokenClaims(string? token, string expectedCreatorHash, string? expectedFingerprint = null, DateTimeOffset? now = null)
    {
        var claims = DecodeToken(token);
        if (claims is null)
            return new ValidationResult(false, "Invalid token format");

        if (IsTokenExpired(token, now))
            return new ValidationResult(false, "Token expired");

        if (!claims.TryGetValue("creator_hash", out var ch) || ch.ValueKind != JsonValueKind.String
            || !string.Equals(ch.GetString(), expectedCreatorHash, StringComparison.Ordinal))
        {
            return new ValidationResult(false, "Creator hash mismatch");
        }

        if (expectedFingerprint is not null)
        {
            if (!claims.TryGetValue("fingerprint", out var fp) || fp.ValueKind != JsonValueKind.String
                || !string.Equals(fp.GetString(), expectedFingerprint, StringComparison.Ordinal))
            {
                return new ValidationResult(false, "Fingerprint mismatch");
            }
        }

        if (claims.TryGetValue("iss", out var iss) && iss.ValueKind == JsonValueKind.String
            && !string.Equals(iss.GetString(), "showad-backend", StringComparison.Ordinal))
        {
            return new ValidationResult(false, "Invalid issuer");
        }

        return new ValidationResult(true, null);
    }

    public static string? GetCreatorHashFromToken(string? token)
    {
        var claims = DecodeToken(token);
        if (claims is null) return null;
        return claims.TryGetValue("creator_hash", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    public static string? GetFingerprintFromToken(string? token)
    {
        var claims = DecodeToken(token);
        if (claims is null) return null;
        return claims.TryGetValue("fingerprint", out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
    }

    private static bool TryGetLong(JsonElement el, out long value)
    {
        switch (el.ValueKind)
        {
            case JsonValueKind.Number:
                if (el.TryGetInt64(out value)) return true;
                if (el.TryGetDouble(out var d)) { value = (long)d; return true; }
                value = 0; return false;
            case JsonValueKind.String:
                return long.TryParse(el.GetString(), out value);
            default:
                value = 0; return false;
        }
    }

    public static byte[] Base64UrlDecode(string value)
    {
        var s = value.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4)
        {
            case 2: s += "=="; break;
            case 3: s += "="; break;
            case 1: throw new FormatException("Invalid base64url length");
        }
        return Convert.FromBase64String(s);
    }

    public static string Base64UrlEncode(byte[] data)
    {
        return Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');
    }

    public static string Base64UrlEncode(string data) => Base64UrlEncode(Encoding.UTF8.GetBytes(data));
}
