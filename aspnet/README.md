# ProofMark.ShowAd.AspNetCore

ASP.NET Core middleware for ProofMark **ShowAd** content gating. Verifies JWT cookies, claims redirect tickets, and redirects unverified visitors through the video-ad flow.

- Targets: `net6.0`, `net7.0`, `net8.0`
- Package: `ProofMark.ShowAd.AspNetCore`
- Wire-compatible with the Laravel and Next.js SDKs.

## Install

```bash
dotnet add package ProofMark.ShowAd.AspNetCore
```

## Quick start (Minimal API, .NET 6/7/8 `Program.cs`)

```csharp
using ShowAd.AspNetCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddShowAd(opts =>
{
    opts.CreatorHash    = builder.Configuration["ShowAd:CreatorHash"]!;
    opts.ApiKey         = builder.Configuration["ShowAd:ApiKey"]!;
    opts.RedirectSecret = builder.Configuration["ShowAd:RedirectSecret"]!;

    opts.ProtectedPaths = new List<string> { "/premium/*", "/premium" };
    opts.ExcludedPaths  = new List<string> { "/health/*", "/api/public/*" };
});

var app = builder.Build();

app.UseShowAd();

app.MapGet("/premium/article/{slug}", (string slug) => $"Premium: {slug}");

app.Run();
```

## Quick start (traditional `Startup.cs`)

```csharp
public class Startup
{
    public void ConfigureServices(IServiceCollection services)
    {
        services.AddShowAd(opts =>
        {
            opts.CreatorHash    = Configuration["ShowAd:CreatorHash"];
            opts.ApiKey         = Configuration["ShowAd:ApiKey"];
            opts.RedirectSecret = Configuration["ShowAd:RedirectSecret"];
            opts.ProtectedPaths = new List<string> { "/premium/*" };
        });
    }

    public void Configure(IApplicationBuilder app, IWebHostEnvironment env)
    {
        app.UseRouting();
        app.UseShowAd();
        app.UseEndpoints(e => e.MapControllers());
    }
}
```

## `[Authorize]`-style attribute pattern (alternative)

If you prefer per-endpoint gating instead of path globs, register the middleware once for the whole app and let your endpoints opt in via the standard `[Authorize]`/policy pattern, with the ShowAd middleware mounted only on attribute-decorated branches:

```csharp
app.UseWhen(
    ctx => ctx.GetEndpoint()?.Metadata.GetMetadata<ShowAdProtectAttribute>() is not null,
    branch => branch.UseShowAd());

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public sealed class ShowAdProtectAttribute : Attribute { }

[ShowAdProtect]
public class PremiumController : ControllerBase
{
    [HttpGet("/premium/dashboard")]
    public string Dashboard() => "ok";
}
```

You can combine this with ASP.NET Core's built-in `[Authorize]` since ShowAd is orthogonal to authentication.

## Configuration

| Option | Default | Notes |
|---|---|---|
| `CreatorHash` | _required_ | Issued by the ShowAd dashboard. |
| `ApiKey` | _required_ | Secret API key, server-only. |
| `RedirectSecret` | _required_ | Used to claim redirect tickets. |
| `ApiBaseUrl` | `https://ad.proofmark.io` | Backend API. |
| `VideoAdUrl` | `https://showad.proofmark.io` | Video-ad frontend. |
| `CookiePrefix` | `showad` | Cookie name prefix. |
| `CookieMaxAgeSeconds` | `3600` | Cookie lifetime. |
| `CookieSecure` | _auto_ | Auto-detected from `IsHttps`. |
| `CookieSameSite` | `Lax` | |
| `ProtectedPaths` | `[]` | Glob patterns. Empty = match everything once middleware is mounted. |
| `ExcludedPaths` | `[]` | Glob patterns evaluated first. |
| `AccessPolicy` | `null` | Verified crawlers, CIDR allowlist, premium bypass. |
| `Debug` | `false` | Verbose `ILogger` output. |

## Cookies (wire-compatible)

| Cookie | HttpOnly | Purpose |
|---|---|---|
| `showad_fingerprint` | no | Set by client, read server-side. |
| `showad_token` | yes | JWT issued by backend. |
| `showad_creator` | no | Creator hash. |
| `showad_ticket` | no | Last claimed ticket id. |
| `showad_verified` | no | `1` when verified. |
| `showad_expires` | no | JWT `exp` as unix seconds. |

## Backend protocol

- `POST {ApiBaseUrl}/api/redirect-ticket/{id}/claim`
  Headers: `X-Redirect-Ticket-Secret`, `X-ShowAd-API-Key`, `X-ShowAd-Creator-Hash`.
  Body: `{ "creator_hash": "..." }`. Maps `410`→`TicketNotFound`, `401`→`TicketClaimFailed`, `403`→`CreatorMismatch`.
- `POST {ApiBaseUrl}/api/sdk/validate`
  Headers: `X-ShowAd-API-Key`, `X-ShowAd-Creator-Hash`.
  Body: `{ "token": "...", "sdk_key": "..." }`.

Redirect URL: `{VideoAdUrl}/c/{creator_hash}?return_url={current}&sdk=1`.

## Access policy

Server-only bypass evaluated before redirect:

```csharp
opts.AccessPolicy = new AccessPolicyOptions
{
    TrustedIpHeaders = new List<string> { "CF-Connecting-IP" },
    AllowCidrs       = new List<string> { "203.0.113.0/24" },
    Crawler = new CrawlerPolicy
    {
        Enabled = true,
        Families = new List<string> { "google", "bing", "openai" },
        FamilyCidrs = new Dictionary<string, IList<string>>
        {
            ["google"] = new List<string> { "66.249.64.0/19" },
        },
        AllowCloudflareVerifiedBot = true,
    },
    BeforeProtect = (http, ctx) =>
        http.User.Identity?.IsAuthenticated == true
            ? AccessPolicyDecision.Allow("authenticated")
            : AccessPolicyDecision.Continue(),
};
```

UA alone never bypasses — a published CIDR, the Cloudflare verified-bot signal, or a custom rDNS verifier must also match.

## JWT decoding

The middleware decodes JWT cookies locally only as preflight. It checks `exp`, `nbf`, `creator_hash`, `fingerprint` (when the cookie is present), and `iss == "showad-backend"` when set, then calls the backend validation endpoint before protected content is allowed.

## Testing

```bash
dotnet restore
dotnet build -c Release
dotnet test
```

Tests use xUnit + `Microsoft.AspNetCore.Mvc.Testing` and mock `IShowAdHttpClient` via Moq.

## License

MIT
