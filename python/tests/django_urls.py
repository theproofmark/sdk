from __future__ import annotations

from django.http import HttpResponse
from django.urls import path


def _ok(request):
    return HttpResponse("ok")


urlpatterns = [
    path("public/article", _ok, name="public_article"),
    path("premium/article", _ok, name="premium_article"),
    path("premium/clean", _ok, name="premium_clean"),
]
