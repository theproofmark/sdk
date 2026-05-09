# ProofMark ShowAd – Python SDK

Server-side content-gating SDK for the ProofMark ShowAd protocol. Visitors must
watch a video ad to unlock protected content; this SDK runs entirely
server-side and is wire-compatible with the [Laravel](../laravel) and
[Next.js](../nextjs) reference SDKs.

- **Python ≥ 3.9**
- **Zero hard dependencies** — defaults to `urllib`. `httpx`, `django`,
  `fastapi`, and `flask` are opt-in extras.
- Adapters for **Django**, **FastAPI / Starlette**, and **Flask**.
- Pure-function `protect()` core that's easy to embed in any other framework.

## Install

```bash
pip install "proofmark-showad[django]"
pip install "proofmark-showad[fastapi]"
pip install "proofmark-showad[flask]"
pip install "proofmark-showad[httpx]"  # async backend or shared connection pool
```

## Configure

`ShowAdConfig` holds all secrets and tunables.

```python
from proofmark_showad import ShowAdConfig

config = ShowAdConfig(
    creator_hash="creator-abc",
    api_key="sk_live_...",
    redirect_secret="rdr_live_...",
    protected_paths=("/premium/*", "/articles/paid/*"),
    excluded_paths=("/healthz",),
)
```

Defaults: `api_base_url=https://ad.proofmark.io`,
`video_ad_url=https://showad.proofmark.io`, `cookie_prefix=showad`,
`cookie_max_age=3600`.

## Django

```python
# settings.py
INSTALLED_APPS = [..., "proofmark_showad.django"]
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "proofmark_showad.django.middleware.ShowAdMiddleware",
]

SHOWAD = {
    "creator_hash": os.environ["SHOWAD_CREATOR_HASH"],
    "api_key": os.environ["SHOWAD_API_KEY"],
    "redirect_secret": os.environ["SHOWAD_REDIRECT_SECRET"],
    "protected_paths": ["/premium/*"],
}
```

You can also build a middleware class bound to a programmatic config (e.g. for
multi-tenant deployments):

```python
from proofmark_showad.django import build_showad_middleware

ShowAdMiddleware = build_showad_middleware(config)
```

## FastAPI / Starlette

```python
from fastapi import FastAPI
from proofmark_showad import ShowAdConfig
from proofmark_showad.fastapi import ShowAdMiddleware

config = ShowAdConfig(
    creator_hash=...,
    api_key=...,
    redirect_secret=...,
    protected_paths=("/premium/*",),
)

app = FastAPI()
app.add_middleware(ShowAdMiddleware, config=config)
```

The same middleware works for raw Starlette apps:

```python
from starlette.applications import Starlette
from starlette.middleware import Middleware
from proofmark_showad.fastapi import ShowAdMiddleware

app = Starlette(middleware=[Middleware(ShowAdMiddleware, config=config)])
```

## Flask

```python
from flask import Flask
from proofmark_showad import ShowAdConfig
from proofmark_showad.flask import init_showad

app = Flask(__name__)
init_showad(app, ShowAdConfig(creator_hash=..., api_key=..., redirect_secret=..., protected_paths=("/premium/*",)))
```

## Access policy

Access policy decisions run **before** the ShowAd verification flow, in this
order:

1. Verified crawler (User-Agent **and** trusted CIDR / rDNS / Cloudflare
   verified-bot header). UA match alone never grants bypass.
2. CIDR allowlist resolved from configured trusted IP headers.
3. Publisher-defined `before_protect` callback (e.g. premium subscribers).

```python
from proofmark_showad import AccessPolicyOptions, CrawlerPolicy

policy = AccessPolicyOptions(
    trusted_ip_headers=("cf-connecting-ip", "x-forwarded-for"),
    allow_cidrs=("10.0.0.0/8",),
    crawler=CrawlerPolicy(
        enabled=True,
        families=("google", "bing"),
        family_cidrs={"google": ("66.249.64.0/19",)},
        allow_cloudflare_verified_bot=True,
    ),
    before_protect=lambda req: (
        {"action": "allow", "reason": "premium_user"}
        if req.header("x-publisher-premium") == "1"
        else "continue"
    ),
)

# Django: pass via SHOWAD["access_policy"] = policy
# FastAPI/Starlette: app.add_middleware(ShowAdMiddleware, config=config, access_policy=policy)
# Flask: init_showad(app, config, access_policy=policy)
```

Supported families: `google`, `bing`, `duckduckgo`, `yandex`, `baidu`, `openai`,
`anthropic`, `perplexity`, `commoncrawl`, `facebook`, `twitter`, `linkedin`.

## Pure protect() function

For frameworks not covered out of the box, build a `ProtectInput` and call
`protect()` (or `protect_async()`):

```python
from proofmark_showad import ProtectInput, protect

inp = ProtectInput(
    config=config,
    method=request.method,
    full_url=request.url,
    pathname=request.path,
    query_params=dict(request.args),
    cookies=dict(request.cookies),
    headers=dict(request.headers),
    remote_addr=request.remote_addr,
    is_secure=request.is_secure,
)

output = protect(inp)
if output.is_redirect:
    return your_framework.redirect(output.redirect_url, cookies=output.cookies_to_set)
```

## Backend API

Direct backend calls (sync + async) are also exposed:

```python
from proofmark_showad import claim_redirect_ticket, validate_token, check_health
from proofmark_showad import claim_redirect_ticket_async, validate_token_async
```

## Development

```bash
python -m venv .venv && source .venv/bin/activate
pip install -e '.[django,fastapi,flask,httpx,test]'
pytest
```

## Protocol cheatsheet

- Cookies: `showad_fingerprint`, `showad_token` (httpOnly), `showad_creator`,
  `showad_ticket`, `showad_verified`, `showad_expires`.
- Redirect URL: `${video_ad_url}/c/{creator_hash}?return_url={url}&sdk=1`.
- Backend: `POST /api/redirect-ticket/:id/claim` and `POST /api/sdk/validate`
  with headers `X-Redirect-Ticket-Secret`, `X-ShowAd-API-Key`,
  `X-ShowAd-Creator-Hash`.
- Existing `showad_token` cookies are locally decoded only as preflight;
  protected content is allowed only after `POST /api/sdk/validate` accepts
  the token.
