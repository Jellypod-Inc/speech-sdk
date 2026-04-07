"""Shared helpers — mirrors src/provider-utils.ts."""

from __future__ import annotations

import os

import httpx


def resolve_api_key(*, api_key: str | None, env_var: str, provider: str) -> str:
    key = api_key or os.environ.get(env_var)
    if not key:
        raise ValueError(
            f"{provider} API key not found. Pass api_key=... or set {env_var}."
        )
    return key


def handle_error_response(response: httpx.Response, provider: str) -> None:
    if response.is_success:
        return
    raise RuntimeError(
        f"{provider} request failed ({response.status_code}): {response.text}"
    )
