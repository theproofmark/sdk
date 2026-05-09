using System.Text;
using System.Text.Json;
using ShowAd.AspNetCore.Jwt;
using Xunit;

namespace ShowAd.AspNetCore.Tests;

public class JwtHelperTests
{
    public static string MakeToken(object claims)
    {
        var header = JwtHelper.Base64UrlEncode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        var payload = JwtHelper.Base64UrlEncode(JsonSerializer.Serialize(claims));
        var signature = JwtHelper.Base64UrlEncode(Encoding.UTF8.GetBytes("test-signature"));
        return $"{header}.{payload}.{signature}";
    }

    [Fact]
    public void DecodeToken_returns_claims()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = MakeToken(new { creator_hash = "ch_1", exp = now + 3600 });
        var claims = JwtHelper.DecodeToken(token);
        Assert.NotNull(claims);
        Assert.Equal("ch_1", claims!["creator_hash"].GetString());
    }

    [Fact]
    public void DecodeToken_returns_null_for_invalid()
    {
        Assert.Null(JwtHelper.DecodeToken("not.a.jwt.really"));
        Assert.Null(JwtHelper.DecodeToken(""));
        Assert.Null(JwtHelper.DecodeToken("a.b"));
    }

    [Fact]
    public void IsTokenExpired_handles_exp_and_nbf()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        Assert.True(JwtHelper.IsTokenExpired(MakeToken(new { exp = now - 10 })));
        Assert.False(JwtHelper.IsTokenExpired(MakeToken(new { exp = now + 3600 })));
        Assert.True(JwtHelper.IsTokenExpired(MakeToken(new { nbf = now + 1000, exp = now + 3600 })));
    }

    [Fact]
    public void GetTokenExpiry_returns_milliseconds()
    {
        var token = MakeToken(new { exp = 1000 });
        Assert.Equal(1_000_000L, JwtHelper.GetTokenExpiry(token));
    }

    [Fact]
    public void ValidateTokenClaims_passes_for_matching_claims()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = MakeToken(new
        {
            creator_hash = "ch_1",
            fingerprint = "fp_1",
            iss = "showad-backend",
            exp = now + 3600,
            nbf = now - 60,
        });
        var r = JwtHelper.ValidateTokenClaims(token, "ch_1", "fp_1");
        Assert.True(r.Valid);
    }

    [Fact]
    public void ValidateTokenClaims_fails_on_mismatched_creator()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = MakeToken(new { creator_hash = "ch_other", exp = now + 3600 });
        var r = JwtHelper.ValidateTokenClaims(token, "ch_1");
        Assert.False(r.Valid);
        Assert.Contains("Creator", r.Reason);
    }

    [Fact]
    public void ValidateTokenClaims_fails_on_mismatched_fingerprint_when_provided()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = MakeToken(new { creator_hash = "ch_1", fingerprint = "fp_a", exp = now + 3600 });
        var r = JwtHelper.ValidateTokenClaims(token, "ch_1", "fp_b");
        Assert.False(r.Valid);
        Assert.Contains("Fingerprint", r.Reason);
    }

    [Fact]
    public void ValidateTokenClaims_fails_on_wrong_issuer()
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var token = MakeToken(new { creator_hash = "ch_1", iss = "evil", exp = now + 3600 });
        var r = JwtHelper.ValidateTokenClaims(token, "ch_1");
        Assert.False(r.Valid);
    }
}
