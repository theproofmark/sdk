"""Django integration for the ShowAd SDK."""

from .middleware import ShowAdMiddleware, build_showad_middleware

default_app_config = "proofmark_showad.django.apps.ProofMarkShowAdConfig"

__all__ = ["ShowAdMiddleware", "build_showad_middleware"]
