"""Test configuration: makes ``tests`` a package and bootstraps Django."""

from __future__ import annotations

import os
import sys
from pathlib import Path


_TESTS_DIR = Path(__file__).resolve().parent
_REPO_ROOT = _TESTS_DIR.parent
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))


os.environ.setdefault("DJANGO_SETTINGS_MODULE", "tests.django_settings")


def pytest_configure(config):
    try:
        import django
    except ImportError:  # pragma: no cover
        return
    django.setup()
