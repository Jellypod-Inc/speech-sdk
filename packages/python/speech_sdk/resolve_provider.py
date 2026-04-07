"""Provider resolution — mirrors src/resolve-provider.ts."""

from __future__ import annotations

from .providers.elevenlabs import create_elevenlabs
from .providers.openai import create_openai
from .speech_provider import SpeechProvider


def resolve_model(model: str | tuple[SpeechProvider, str]) -> tuple[SpeechProvider, str]:
    """Accepts ``"provider/model"`` or a pre-built ``(provider, model_id)`` tuple."""
    if isinstance(model, tuple):
        return model

    if "/" not in model:
        raise ValueError(f'Model must be "provider/model-id", got: {model!r}')

    provider_name, _, model_id = model.partition("/")
    provider = _create_builtin_provider(provider_name)
    return provider, model_id


def _create_builtin_provider(name: str) -> SpeechProvider:
    if name == "openai":
        return create_openai()
    if name == "elevenlabs":
        return create_elevenlabs()
    raise ValueError(f"Unknown provider: {name!r}")
