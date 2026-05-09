"""Example FastAPI app wired with the ShowAd middleware."""

from __future__ import annotations

import os

from fastapi import FastAPI

from proofmark_showad import (
    AccessPolicyOptions,
    CrawlerPolicy,
    ShowAdConfig,
)
from proofmark_showad.fastapi import ShowAdMiddleware


config = ShowAdConfig(
    creator_hash=os.environ["SHOWAD_CREATOR_HASH"],
    api_key=os.environ["SHOWAD_API_KEY"],
    redirect_secret=os.environ["SHOWAD_REDIRECT_SECRET"],
    protected_paths=("/premium/*",),
    excluded_paths=("/healthz",),
)

access_policy = AccessPolicyOptions(
    trusted_ip_headers=("cf-connecting-ip",),
    crawler=CrawlerPolicy(
        enabled=True,
        families=("google", "bing"),
        allow_cloudflare_verified_bot=True,
    ),
)

app = FastAPI()
app.add_middleware(ShowAdMiddleware, config=config, access_policy=access_policy)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/premium/{slug}")
def premium(slug: str):
    return {"slug": slug, "tier": "premium"}
