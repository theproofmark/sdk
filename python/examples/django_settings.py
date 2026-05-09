"""Example Django settings snippet for ProofMark ShowAd."""

from __future__ import annotations

import os

from proofmark_showad import AccessPolicyOptions, CrawlerPolicy

INSTALLED_APPS = [
    "proofmark_showad.django",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "proofmark_showad.django.middleware.ShowAdMiddleware",
]

SHOWAD = {
    "creator_hash": os.environ["SHOWAD_CREATOR_HASH"],
    "api_key": os.environ["SHOWAD_API_KEY"],
    "redirect_secret": os.environ["SHOWAD_REDIRECT_SECRET"],
    "api_base_url": os.environ.get("SHOWAD_API_URL", "https://ad.proofmark.io"),
    "video_ad_url": os.environ.get("SHOWAD_VIDEO_URL", "https://showad.proofmark.io"),
    "protected_paths": ["/premium/*", "/articles/paid/*"],
    "excluded_paths": ["/healthz", "/api/public/*"],
    "access_policy": AccessPolicyOptions(
        trusted_ip_headers=("cf-connecting-ip", "x-forwarded-for"),
        crawler=CrawlerPolicy(
            enabled=True,
            families=("google", "bing"),
            allow_cloudflare_verified_bot=True,
        ),
    ),
}
