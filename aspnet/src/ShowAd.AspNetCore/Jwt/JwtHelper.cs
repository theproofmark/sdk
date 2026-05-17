using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace ShowAd.AspNetCore.Jwt;

/// <summary>
/// Minimal JWT decoder. The backend handles signature verification; this
/// helper only inspects payload claims (exp, nbf, creator_hash, fingerprint, iss).
///
/// Defense-in-depth: tokens whose header `alg` is `none` or outside the
/// HS256/HS384/HS512/RS256/RS384/RS512/ES256/ES384 whitelist are rejected
/// before any payload claims are inspected.
/// </summary>
public static class JwtHelper
{
    public const string ExpectedIssuer = "showad-backend";

    public const long DefaultLeewaySeconds = 60;

    /// <summary>Algorithms accepted for local payload inspection.</summary>
    public static readonly HashSet<string> AllowedAlgorithms = new(StringComparer.Ordinal)
    {
        "HS256", "HS384", "HS512",
        "RS256", "RS384", "RS512",
        "ES256", "ES384",
    };

    public readonly record struct ValidationResult(bool Valid, string? Reason);

    public sealed class ClaimValidationOptions
    {
        public long LeewaySeconds { get; init; } = DefaultLeewaySeconds;
        public bool RequireIssuer { get; init; } = true;
    }

    public static IReadOnlyDictionary<string, JsonElement>? DecodeToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var parts = token.Split('.');
        if (parts.Length != 3) return null;

        // Reject 'none' and unknown algorithms (defense in depth).
        try
        {
            var headerBytes = Base64UrlDecode(parts[0]);
            using var headerDoc = JsonDocument.Parse(headerBytes);
            if (headerDoc.RootElement.ValueKind != JsonValueKind.Object) return null;
            if (!headerDoc.RootElement.TryGetProperty("alg", out var alg)
                || alg.ValueKind != JsonValueKind.String
                || alg.GetString() is not { } algStr
                || !AllowedAlgorithms.Contains(algStr))
            {
                return null;
            }
        }
        catch
        {
            return null;
        }

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

    public static bool IsTokenExpired(string? token, DateTimeOffset? now = null, long leewaySeconds = DefaultLeewaySeconds)
    {
        var claims = DecodeToken(token);
        if (claims is null) return true;

        var nowSec = (now ?? DateTimeOffset.UtcNow).ToUnixTimeSeconds();

        if (claims.TryGetValue("exp", out var exp) && TryGetLong(exp, out var expVal) && (expVal + leewaySeconds) < nowSec)
            return true;

        if (claims.TryGetValue("nbf", out var nbf) && TryGetLong(nbf, out var nbfVal) && (nbfVal - leewaySeconds) > nowSec)
            return true;

        if (claims.TryGetValue("iat", out var iat) && TryGetLong(iat, out var iatVal) && (iatVal - leewaySeconds) > nowSec)
            return true;

        return false;
    }

    /// <summary>Returns the token expiry as Unix seconds (matches JWT `exp` claim), or null when missing.</summary>
    public static long? GetTokenExpiry(string? token)
    {
        var claims = DecodeToken(token);
        if (claims is null) return null;
        if (!claims.TryGetValue("exp", out var exp)) return null;
        return TryGetLong(exp, out var v) ? v : null;
    }

    public static ValidationResult ValidateTokenClaims(
        string? token,
        string expectedCreatorHash,
        string? expectedFingerprint = null,
        DateTimeOffset? now = null,
        ClaimValidationOptions? options = null)
    {
        options ??= new ClaimValidationOptions();
        var claims = DecodeToken(token);
        if (claims is null)
            return new ValidationResult(false, "Invalid token format");

        if (IsTokenExpired(token, now, options.LeewaySeconds))
            return new ValidationResult(false, "Token expired");

        if (!claims.TryGetValue("creator_hash", out var ch) || ch.ValueKind != JsonValueKind.String
            || !FixedTimeEqual(ch.GetString(), expectedCreatorHash))
        {
            return new ValidationResult(false, "Creator hash mismatch");
        }

        if (expectedFingerprint is not null)
        {
            if (!claims.TryGetValue("fingerprint", out var fp) || fp.ValueKind != JsonValueKind.String
                || !FixedTimeEqual(fp.GetString(), expectedFingerprint))
            {
                return new ValidationResult(false, "Fingerprint mismatch");
            }
        }

        var issuerProvided = claims.TryGetValue("iss", out var iss) && iss.ValueKind == JsonValueKind.String;
        if (options.RequireIssuer)
        {
            if (!issuerProvided || !string.Equals(iss.GetString(), ExpectedIssuer, StringComparison.Ordinal))
            {
                return new ValidationResult(false, "Invalid issuer");
            }
        }
        else if (issuerProvided && !string.Equals(iss.GetString(), ExpectedIssuer, StringComparison.Ordinal))
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

    private static bool FixedTimeEqual(string? a, string? b)
    {
        if (a is null || b is null) return false;
        var aBytes = Encoding.UTF8.GetBytes(a);
        var bBytes = Encoding.UTF8.GetBytes(b);
        if (aBytes.Length != bBytes.Length) return false;
        return CryptographicOperations.FixedTimeEquals(aBytes, bBytes);
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
