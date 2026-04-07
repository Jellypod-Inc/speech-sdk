"""Public API — mirrors src/generate-speech.ts."""

from __future__ import annotations

from typing import Any

from tenacity import AsyncRetrying, retry_if_exception_type, stop_after_attempt, wait_exponential

from .resolve_provider import resolve_model
from .speech_provider import SpeechProvider, SpeechRequest
from .speech_result import SpeechResult


async def generate_speech(
    *,
    model: str | tuple[SpeechProvider, str],
    text: str,
    voice: str | None = None,
    output_format: str | None = None,
    provider_options: dict[str, Any] | None = None,
    max_retries: int = 2,
) -> SpeechResult:
    """Generate speech audio from text using the configured provider."""
    provider, model_id = resolve_model(model)
    request = SpeechRequest(
        text=text,
        voice=voice,
        output_format=output_format,
        provider_options={**(provider_options or {}), "model": model_id},
    )

    async for attempt in AsyncRetrying(
        stop=stop_after_attempt(max_retries + 1),
        wait=wait_exponential(multiplier=0.5, max=8),
        retry=retry_if_exception_type(RuntimeError),
        reraise=True,
    ):
        with attempt:
            return await provider.generate(request)

    raise RuntimeError("unreachable")  # pragma: no cover
