# proofmark-showad (Ruby / Rack)

ProofMark **ShowAd** content-gating SDK as a Rack middleware. Works with
**Rails**, **Sinatra**, **Hanami**, or any plain Rack application.

The middleware sits in front of your protected routes and:

1. Lets excluded paths through.
2. Skips paths outside `protected_paths` (when configured).
3. Runs an access policy (verified-crawler / CIDR allowlist /
   `before_protect` callback) — UA matching alone never grants bypass.
4. Claims a one-shot redirect ticket from the ShowAd backend when the
   user returns from the video ad with `?redirect_ticket=...`, sets the
   verification cookies, and 302s to the clean URL.
5. If a `showad_token` cookie is present, locally validates claims as
   preflight, then authorizes it through the backend before letting the
   request through.
6. Otherwise, redirects to the ShowAd video-ad page with a `return_url`
   pointing back at the original URL.

The wire protocol matches the Laravel and Next.js SDKs exactly: same
endpoints, same headers, same cookie names.

## Installation

```ruby
# Gemfile
gem 'proofmark-showad', '~> 1.0', require: 'showad'
```

```bash
bundle install
```

**Requirements:** Ruby ≥ 2.7. Hard dependency on `rack` only. JSON,
`Net::HTTP`, and `IPAddr` are stdlib. `base64` is a default gem.

## Rails

The gem ships a Railtie that auto-inserts the middleware when
`config.showad.creator_hash` is set.

```ruby
# config/initializers/showad.rb
Rails.application.configure do
  config.showad.creator_hash    = ENV.fetch('SHOWAD_CREATOR_HASH')
  config.showad.api_key         = ENV.fetch('SHOWAD_API_KEY')
  config.showad.redirect_secret = ENV.fetch('SHOWAD_REDIRECT_SECRET')

  config.showad.protected_paths = ['/premium/*', '/members/*']
  config.showad.excluded_paths  = ['/healthz', '/assets/*']

  config.showad.access_policy = {
    trusted_ip_headers: ['CF-Connecting-IP', 'X-Forwarded-For'],
    allow_cidrs: %w[10.0.0.0/8],
    crawler: {
      enabled: true,
      allow_cloudflare_verified_bot: true,
      family_cidrs: { 'google' => %w[66.249.64.0/19] }
    },
    before_protect: ->(_req, client_ip:, user_agent:) {
      # next 'allow' if Current.user&.premium?
      'continue'
    }
  }

  config.showad.debug = Rails.env.development?
end
```

See [`examples/rails_initializer.rb`](examples/rails_initializer.rb).

## Sinatra

```ruby
require 'sinatra'
require 'showad'

use ShowAd::Middleware, ShowAd::Config.new(
  creator_hash:    ENV.fetch('SHOWAD_CREATOR_HASH'),
  api_key:         ENV.fetch('SHOWAD_API_KEY'),
  redirect_secret: ENV.fetch('SHOWAD_REDIRECT_SECRET'),
  protected_paths: ['/premium/*']
)
```

See [`examples/sinatra_app.rb`](examples/sinatra_app.rb).

## Plain Rack / Hanami

```ruby
# config.ru
require 'showad'

use ShowAd::Middleware, ShowAd::Config.new(
  creator_hash:    ENV.fetch('SHOWAD_CREATOR_HASH'),
  api_key:         ENV.fetch('SHOWAD_API_KEY'),
  redirect_secret: ENV.fetch('SHOWAD_REDIRECT_SECRET'),
  protected_paths: ['/premium/*']
)

run MyApp.new
```

See [`examples/rack_app.ru`](examples/rack_app.ru). Hanami exposes the
same `use` interface in `config.ru`.

## Configuration reference

| Key                  | Type                  | Default                       | Notes                                                   |
| -------------------- | --------------------- | ----------------------------- | ------------------------------------------------------- |
| `creator_hash`       | `String`              | —                             | **Required.** Your ShowAd creator identifier.           |
| `api_key`            | `String`              | —                             | **Required** for any backend call.                      |
| `redirect_secret`    | `String`              | —                             | **Required** to claim redirect tickets.                 |
| `api_base_url`       | `String`              | `https://ad.proofmark.io`     | Backend API host.                                       |
| `video_ad_url`       | `String`              | `https://showad.proofmark.io` | Front-door video-ad host.                               |
| `cookie_prefix`      | `String`              | `showad`                      | Prefix for all six cookie names.                        |
| `cookie_max_age`     | `Integer` (seconds)   | `3600`                        | Verification cookie lifetime.                           |
| `cookie_secure`      | `Boolean`/`nil`       | inferred                      | When `nil`, inferred from request scheme.               |
| `cookie_same_site`   | `String`              | `Lax`                         | `Lax`, `Strict`, or `None`.                             |
| `protected_paths`    | `Array<String>`       | `[]`                          | Glob patterns. Empty = protect every non-excluded path. |
| `excluded_paths`     | `Array<String>`       | `[]`                          | Glob patterns. Always allowed.                          |
| `access_policy`      | `Hash`                | `nil`                         | See below.                                              |
| `http_client`        | duck-typed            | `ShowAd::HttpClient.new`      | Override for tests.                                     |
| `logger`             | duck-typed (`#debug`) | `nil`                         | Used when `debug: true`.                                |
| `debug`              | `Boolean`             | `false`                       | Verbose logging.                                        |

### Access policy

The access policy runs *before* the cookie/ticket dance. UA matching
alone never grants bypass.

```ruby
{
  trusted_ip_headers: ['CF-Connecting-IP', 'X-Forwarded-For'],
  allow_cidrs: %w[10.0.0.0/8 2001:db8::/32],
  crawler: {
    enabled: true,
    allow_cloudflare_verified_bot: true,
    family_cidrs: {
      'google' => %w[66.249.64.0/19],
      'bing'   => %w[40.77.167.0/24]
    },
    reverse_dns_verifier: ->(ip, family) { my_dns_check(ip, family) }
  },
  before_protect: ->(request, client_ip:, user_agent:) {
    # 'allow' / 'continue' / { action: 'redirect', redirect_url: '...' }
  }
}
```

## Cookies

All names are prefixed (default `showad_`):

| Cookie               | HttpOnly | Set by middleware                              |
| -------------------- | -------- | ---------------------------------------------- |
| `showad_fingerprint` | no       | client-side script (read here)                 |
| `showad_token`       | **yes**  | on ticket claim and on cookie refresh          |
| `showad_creator`     | no       | on ticket claim and on cookie refresh          |
| `showad_ticket`      | no       | on ticket claim                                |
| `showad_verified`    | no       | on ticket claim and on cookie refresh          |
| `showad_expires`     | no       | on ticket claim and on cookie refresh          |

## Token validation

JWT tokens are decoded as base64url + JSON as a local preflight only. The
middleware checks `exp`, `nbf`, `creator_hash`, `fingerprint` (when the cookie
is set), and `iss == 'showad-backend'` (when present), then calls
`/api/sdk/validate` before allowing protected content.

## Programmatic API

```ruby
config = ShowAd::Config.new(creator_hash: '...', api_key: '...', redirect_secret: '...')
api    = ShowAd::Api.new(config)

api.claim_redirect_ticket('tkt_abc')   # => Hash with token, creator_hash, ...
api.validate_token('eyJ...')           # raises TokenInvalid on rejection
api.check_health                       # => true / false

ShowAd::JwtHelper.token_expired?(token)
ShowAd::JwtHelper.token_expiry(token)
ShowAd::JwtHelper.validate_token_claims(token, 'crh_...', 'fp_...')

ShowAd::Url.build_video_ad_redirect_url('https://showad.proofmark.io', 'crh_...', 'https://example.com/foo')
ShowAd::Url.remove_query_param('https://e.com/x?a=1&b=2', 'a')
```

## Errors

All SDK errors inherit from `ShowAd::Error`:

* `ShowAd::TicketNotFound` — claim returned 410.
* `ShowAd::TicketClaimFailed` — 401 or other non-2xx claim failure.
* `ShowAd::CreatorMismatch` — 403 or response creator hash mismatch.
* `ShowAd::TokenInvalid` — `/api/sdk/validate` rejected the token.
* `ShowAd::NetworkError` — transport-level failure.
* `ShowAd::ConfigError` — required configuration is missing.

## Testing

```bash
bundle install
bundle exec rspec
```

The middleware specs use `Rack::MockRequest` and a `FakeHttpClient` so
no network calls are made.

## License

MIT.
