# ProofMark ShowAd Spring Boot Starter

Auto-configured Servlet filter that gates Spring Boot endpoints behind the [ProofMark ShowAd](https://proofmark.io) verification flow. Wire-compatible with the Laravel and Next.js SDKs (same cookies, same headers, same JWT shape).

- **Java:** 17+
- **Spring Boot:** 3.2+
- **Coordinates:** `io.proofmark:showad-spring-boot-starter:1.0.0`

## Install

```xml
<dependency>
  <groupId>io.proofmark</groupId>
  <artifactId>showad-spring-boot-starter</artifactId>
  <version>1.0.0</version>
</dependency>
```

The starter ships an `AutoConfiguration` registered through `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, so no `@Import` is required.

## Configure

Provide the publisher credentials and pick the URL patterns to protect. Anything outside `protected-paths` is left untouched.

```yaml
showad:
  enabled: true
  creator-hash: ${SHOWAD_CREATOR_HASH}
  api-key: ${SHOWAD_API_KEY}
  redirect-secret: ${SHOWAD_REDIRECT_SECRET}

  protected-paths:
    - /premium/**
    - /pro/**
  excluded-paths:
    - /actuator/**
    - /health

  api-base-url: https://ad.proofmark.io   # optional, default
  video-ad-url: https://showad.proofmark.io  # optional, default

  validate-on-backend: true   # POST /api/sdk/validate existing token cookies
  debug: false

  cookie:
    prefix: showad
    max-age: 3600
    same-site: Lax
    # secure: true   # leave unset to mirror request.isSecure()

  http:
    connect-timeout-millis: 5000
    read-timeout-millis: 10000

  access-policy:
    enabled: true
    # Default is empty. Only add headers that your edge proxy strips and rewrites.
    trusted-ip-headers: [CF-Connecting-IP]
    allow-cidrs: [10.0.0.0/8]
    crawler:
      enabled: true
      allow-cloudflare-verified-bot: true
      family-cidrs:
        google: [66.249.64.0/19]
        bing:   [40.77.167.0/24]
```

> Set `showad.enabled=false` (the default) to keep the starter on the classpath without registering the filter.

## Verification flow

The `ShowAdFilter` runs once per request and follows the same pipeline as every ProofMark SDK:

1. **Path match** — exit early on `excluded-paths` or paths that don't match `protected-paths`.
2. **Access policy** — verified crawler (UA family + IP CIDR or Cloudflare verified-bot) and CIDR allow-list. UA alone never bypasses.
3. **Redirect ticket** — if `?redirect_ticket=...` is present, claim it via `POST /api/redirect-ticket/{id}/claim` and redirect to a clean URL with the verification cookies set.
4. **Existing token** — read `showad_token`, JWT-decode locally as a preflight, then validate authoritatively through `POST /api/sdk/validate`. Refresh sibling cookies when they drift.
5. **Otherwise** — clear the cookie set and 302 to `${videoAdUrl}/c/{creatorHash}?return_url=…&sdk=1`.

## Cookies

All cookies use the configured prefix (default `showad`):

| Suffix         | HttpOnly | Purpose                                   |
| -------------- | -------- | ----------------------------------------- |
| `_token`       | yes      | Backend-issued JWT                        |
| `_verified`    | no       | `1` once the request is verified          |
| `_creator`     | no       | Creator hash currently in use             |
| `_ticket`      | no       | Last claimed redirect ticket id           |
| `_expires`     | no       | Token `exp` as unix seconds               |
| `_fingerprint` | no       | Browser fingerprint set by client script  |

## Use the API directly

The `ShowAdApi` bean is also registered for ad-hoc verification (e.g. inside a controller for soft paywalls):

```java
@RestController
class PremiumController {

    private final ShowAdApi showAd;

    PremiumController(ShowAdApi showAd) { this.showAd = showAd; }

    @GetMapping("/premium/welcome")
    public String welcome() {
        return "Welcome, verified visitor for creator " + showAd.getProperties().getCreatorHash();
    }
}
```

For an end-to-end starter app see [`examples/DemoController.java`](examples/DemoController.java) and [`examples/application.yml`](examples/application.yml).

## Customising the HTTP client

The default client uses Spring's `RestTemplate` with the configured timeouts. Provide your own bean to override (Spring 6.1 `RestClient`, Apache HC, OkHttp, etc.):

```java
@Bean
ShowAdHttpClient showAdHttpClient(ShowAdProperties properties) {
    return new MyRestClientBackedShowAdHttpClient(properties);
}
```

## Testing

```bash
./mvnw -B test
# or, if Maven is on PATH:
mvn -B test
```

Tests exercise the filter with `MockHttpServletRequest`/`MockFilterChain` and a mocked `ShowAdHttpClient`, covering happy-path verification, token expiry, ticket claim, and access policy.

## License

MIT.
