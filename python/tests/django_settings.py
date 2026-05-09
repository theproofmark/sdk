"""Minimal Django settings for the test suite."""

from __future__ import annotations

SECRET_KEY = "test-secret-key-for-proofmark-showad"
DEBUG = False
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    "django.contrib.contenttypes",
    "django.contrib.auth",
]

MIDDLEWARE = [
    "proofmark_showad.django.middleware.ShowAdMiddleware",
]

ROOT_URLCONF = "tests.django_urls"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": ":memory:",
    }
}

USE_TZ = True

SHOWAD = {
    "creator_hash": "creator-test-hash",
    "api_key": "test-api-key",
    "redirect_secret": "test-redirect-secret",
    "api_base_url": "https://ad.test.proofmark.io",
    "video_ad_url": "https://showad.test.proofmark.io",
    "protected_paths": ("/premium/*",),
    "excluded_paths": ("/public/*",),
}

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
