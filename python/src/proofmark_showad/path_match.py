"""Glob-style path matching with ``*`` wildcards (matches reference SDKs)."""

from __future__ import annotations

import re
from functools import lru_cache
from typing import Iterable


def _normalize(path: str) -> str:
    return "/" + path.lstrip("/")


@lru_cache(maxsize=512)
def _compile(pattern: str) -> re.Pattern:
    escaped = re.escape(pattern).replace(r"\*", ".*")
    return re.compile(f"^{escaped}$")


def path_matches(path: str, pattern: str) -> bool:
    if not pattern:
        return False
    p = _normalize(path)
    pat = _normalize(pattern)
    if p == pat:
        return True
    if "*" not in pat:
        return False
    return bool(_compile(pat).match(p))


def path_matches_any(path: str, patterns: Iterable[str]) -> bool:
    return any(path_matches(path, pattern) for pattern in patterns)


__all__ = ["path_matches", "path_matches_any"]
