using System.Net;
using System.Net.Http;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Hosting;
using Moq;
using ShowAd.AspNetCore.AccessPolicy;
using ShowAd.AspNetCore.Http;
using ShowAd.AspNetCore.Jwt;
using Xunit;

namespace ShowAd.AspNetCore.Tests;

public sealed class TestAppFactory : WebApplicationFactory<TestStartupMarker>
{
    public Mock<IShowAdHttpClient> HttpClientMock { get; } = new(MockBehavior.Strict);
    public Action<ShowAdOptions>? ConfigureOptions { get; set; }

    protected override IHost CreateHost(IHostBuilder builder)
    {
        builder.UseContentRoot(AppContext.BaseDirectory);
        return base.CreateHost(builder);
    }

    protected override IHostBuilder CreateHostBuilder()
    {
        return Host.CreateDefaultBuilder()
            .ConfigureWebHostDefaults(web =>
            {
                web.UseTestServer();
                web.UseContentRoot(AppContext.BaseDirectory);
                web.Configure(app =>
                {
                    app.UseShowAd();
                    app.Run(async ctx =>
                    {
                        await ctx.Response.WriteAsync("premium-content");
                    });
                });
                web.ConfigureServices(services =>
                {
                    services.AddShowAd(opts =>
                    {
                        opts.CreatorHash = "test_creator_hash";
                        opts.ApiKey = "test_api_key";
                        opts.RedirectSecret = "test_redirect_secret";
                        opts.ProtectedPaths = new List<string> { "/premium/*", "/premium" };
                        ConfigureOptions?.Invoke(opts);
                    });
                    services.RemoveAll<IShowAdHttpClient>();
                    services.AddSingleton<IShowAdHttpClient>(_ => HttpClientMock.Object);
                });
            });
    }
}

public sealed class TestStartupMarker { }

public class ShowAdMiddlewareTests
{
    private static string MakeValidToken(string creatorHash = "test_creator_hash", string? fingerprint = "fp_123", string? iss = "showad-backend")
    {
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var claims = new Dictionary<string, object?>
        {
            ["creator_hash"] = creatorHash,
            ["exp"] = now + 3600,
            ["nbf"] = now - 60,
        };
        if (fingerprint is not null) claims["fingerprint"] = fingerprint;
        if (iss is not null) claims["iss"] = iss;

        var header = JwtHelper.Base64UrlEncode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        var payload = JwtHelper.Base64UrlEncode(JsonSerializer.Serialize(claims));
        var sig = JwtHelper.Base64UrlEncode(System.Text.Encoding.UTF8.GetBytes("sig"));
        return $"{header}.{payload}.{sig}";
    }

    [Fact]
    public async Task Unprotected_path_passes_through()
    {
        await using var factory = new TestAppFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var resp = await client.GetAsync("/about");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("premium-content", await resp.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task Protected_path_with_no_token_redirects_to_video_ad()
    {
        await using var factory = new TestAppFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var resp = await client.GetAsync("/premium");
        Assert.True(resp.StatusCode is HttpStatusCode.Redirect or HttpStatusCode.Found);
        var location = resp.Headers.Location!.ToString();
        Assert.Contains("showad.proofmark.io/c/test_creator_hash", location);
        Assert.Contains("sdk=1", location);
        Assert.Contains("return_url=", location);
    }

    [Fact]
    public async Task Protected_path_with_valid_token_and_fingerprint_allows_access()
    {
        await using var factory = new TestAppFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var token = MakeValidToken();
        factory.HttpClientMock
            .Setup(x => x.ValidateTokenAsync(token, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ValidateTokenResult { Valid = true, Message = "ok" });

        var req = new HttpRequestMessage(HttpMethod.Get, "/premium");
        req.Headers.Add("Cookie", $"showad_token={token}; showad_fingerprint=fp_123");
        var resp = await client.SendAsync(req);

        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("premium-content", await resp.Content.ReadAsStringAsync());
        factory.HttpClientMock.Verify(x => x.ValidateTokenAsync(token, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Forged_token_with_matching_claims_redirects_when_backend_rejects()
    {
        await using var factory = new TestAppFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var token = MakeValidToken();
        factory.HttpClientMock
            .Setup(x => x.ValidateTokenAsync(token, It.IsAny<CancellationToken>()))
            .ReturnsAsync(new ValidateTokenResult { Valid = false, Message = "forged" });

        var req = new HttpRequestMessage(HttpMethod.Get, "/premium");
        req.Headers.Add("Cookie", $"showad_token={token}; showad_fingerprint=fp_123");
        var resp = await client.SendAsync(req);

        Assert.True(resp.StatusCode is HttpStatusCode.Redirect or HttpStatusCode.Found);
        Assert.Contains("showad.proofmark.io/c/test_creator_hash", resp.Headers.Location!.ToString());
        var setCookies = resp.Headers.GetValues("Set-Cookie").ToList();
        Assert.Contains(setCookies, c => c.StartsWith("showad_token=") && c.Contains("max-age=0", StringComparison.OrdinalIgnoreCase));
        factory.HttpClientMock.Verify(x => x.ValidateTokenAsync(token, It.IsAny<CancellationToken>()), Times.Once);
    }

    [Fact]
    public async Task Expired_token_redirects_to_video_ad()
    {
        await using var factory = new TestAppFactory();
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });

        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var claims = new { creator_hash = "test_creator_hash", fingerprint = "fp_123", exp = now - 60, iss = "showad-backend" };
        var header = JwtHelper.Base64UrlEncode("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
        var payload = JwtHelper.Base64UrlEncode(JsonSerializer.Serialize(claims));
        var token = $"{header}.{payload}.x";

        var req = new HttpRequestMessage(HttpMethod.Get, "/premium");
        req.Headers.Add("Cookie", $"showad_token={token}; showad_fingerprint=fp_123");
        var resp = await client.SendAsync(req);

        Assert.True(resp.StatusCode is HttpStatusCode.Redirect or HttpStatusCode.Found);
        Assert.Contains("showad.proofmark.io/c/test_creator_hash", resp.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Redirect_ticket_claims_token_and_sets_cookies()
    {
        await using var factory = new TestAppFactory();
        var token = MakeValidToken();
        factory.HttpClientMock
            .Setup(x => x.ClaimRedirectTicketAsync("ticket_123", It.IsAny<CancellationToken>()))
            .ReturnsAsync(new TicketClaimResult { Token = token, CreatorHash = "test_creator_hash", TicketId = "ticket_123" });

        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var req = new HttpRequestMessage(HttpMethod.Get, "/premium?redirect_ticket=ticket_123");
        req.Headers.Add("Cookie", "showad_fingerprint=fp_123");
        var resp = await client.SendAsync(req);

        Assert.True(resp.StatusCode is HttpStatusCode.Redirect or HttpStatusCode.Found);
        var loc = resp.Headers.Location!.ToString();
        Assert.DoesNotContain("redirect_ticket=", loc);
        var setCookies = resp.Headers.GetValues("Set-Cookie").ToList();
        Assert.Contains(setCookies, c => c.StartsWith("showad_token="));
        Assert.Contains(setCookies, c => c.Contains("HttpOnly", StringComparison.OrdinalIgnoreCase));
        Assert.Contains(setCookies, c => c.StartsWith("showad_verified=1"));
        Assert.Contains(setCookies, c => c.StartsWith("showad_creator=test_creator_hash"));
    }

    [Fact]
    public async Task Failed_ticket_claim_redirects_to_video_ad()
    {
        await using var factory = new TestAppFactory();
        factory.HttpClientMock
            .Setup(x => x.ClaimRedirectTicketAsync(It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ThrowsAsync(new ShowAd.AspNetCore.Errors.ShowAdException("nope", ShowAd.AspNetCore.Errors.ShowAdErrorCode.TicketNotFound));

        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var req = new HttpRequestMessage(HttpMethod.Get, "/premium?redirect_ticket=bad_ticket");
        req.Headers.Add("Cookie", "showad_fingerprint=fp_123");
        var resp = await client.SendAsync(req);

        Assert.True(resp.StatusCode is HttpStatusCode.Redirect or HttpStatusCode.Found);
        Assert.Contains("showad.proofmark.io/c/test_creator_hash", resp.Headers.Location!.ToString());
    }

    [Fact]
    public async Task Crawler_ua_alone_does_not_bypass()
    {
        await using var factory = new TestAppFactory
        {
            ConfigureOptions = opts =>
            {
                opts.AccessPolicy = new AccessPolicyOptions
                {
                    Crawler = new CrawlerPolicy
                    {
                        Enabled = true,
                        Families = new List<string> { "google" },
                        FamilyCidrs = new Dictionary<string, IList<string>> { ["google"] = new List<string> { "66.249.64.0/19" } },
                    },
                };
            },
        };
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var req = new HttpRequestMessage(HttpMethod.Get, "/premium");
        req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
        var resp = await client.SendAsync(req);
        Assert.True(resp.StatusCode is HttpStatusCode.Redirect or HttpStatusCode.Found);
    }

    [Fact]
    public async Task Crawler_with_trusted_ip_bypasses()
    {
        await using var factory = new TestAppFactory
        {
            ConfigureOptions = opts =>
            {
                opts.AccessPolicy = new AccessPolicyOptions
                {
                    TrustedIpHeaders = new List<string> { "CF-Connecting-IP" },
                    Crawler = new CrawlerPolicy
                    {
                        Enabled = true,
                        Families = new List<string> { "google" },
                        FamilyCidrs = new Dictionary<string, IList<string>> { ["google"] = new List<string> { "66.249.64.0/19" } },
                    },
                };
            },
        };
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var req = new HttpRequestMessage(HttpMethod.Get, "/premium");
        req.Headers.UserAgent.ParseAdd("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)");
        req.Headers.Add("CF-Connecting-IP", "66.249.66.1");
        var resp = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
        Assert.Equal("premium-content", await resp.Content.ReadAsStringAsync());
    }

    [Fact]
    public async Task BeforeProtect_callback_can_allow_premium_user()
    {
        await using var factory = new TestAppFactory
        {
            ConfigureOptions = opts =>
            {
                opts.AccessPolicy = new AccessPolicyOptions
                {
                    BeforeProtect = (http, _) => http.Request.Headers["X-Publisher-Premium"] == "1"
                        ? AccessPolicyDecision.Allow("premium_user")
                        : AccessPolicyDecision.Continue(),
                };
            },
        };
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var req = new HttpRequestMessage(HttpMethod.Get, "/premium");
        req.Headers.Add("X-Publisher-Premium", "1");
        var resp = await client.SendAsync(req);
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }

    [Fact]
    public async Task Excluded_path_passes_through_even_if_protected_by_default()
    {
        await using var factory = new TestAppFactory
        {
            ConfigureOptions = opts =>
            {
                opts.ProtectedPaths = new List<string> { "/*" };
                opts.ExcludedPaths = new List<string> { "/health/*", "/health" };
            },
        };
        using var client = factory.CreateClient(new WebApplicationFactoryClientOptions { AllowAutoRedirect = false });
        var resp = await client.GetAsync("/health/check");
        Assert.Equal(HttpStatusCode.OK, resp.StatusCode);
    }
}
