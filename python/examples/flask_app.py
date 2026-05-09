"""Example Flask app wired with the ShowAd before_request hook."""

from __future__ import annotations

import os

from flask import Flask

from proofmark_showad import ShowAdConfig
from proofmark_showad.flask import init_showad


app = Flask(__name__)

config = ShowAdConfig(
    creator_hash=os.environ["SHOWAD_CREATOR_HASH"],
    api_key=os.environ["SHOWAD_API_KEY"],
    redirect_secret=os.environ["SHOWAD_REDIRECT_SECRET"],
    protected_paths=("/premium/*",),
    excluded_paths=("/healthz",),
)

init_showad(app, config)


@app.get("/healthz")
def healthz():
    return {"ok": True}


@app.get("/premium/<slug>")
def premium(slug: str):
    return {"slug": slug, "tier": "premium"}
