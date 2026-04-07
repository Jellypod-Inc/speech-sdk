"""Provider abstraction — mirrors src/speech-provider.ts."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol

from .speech_result import SpeechResult


@dataclass
class SpeechRequest:
    text: str
    voice: str | None = None
    output_format: str | None = None
    provider_options: dict[str, Any] = field(default_factory=dict)


class SpeechProvider(Protocol):
    """A provider implementation. Mirrors `SpeechProvider` in the TS SDK."""

    name: str

    async def generate(self, request: SpeechRequest) -> SpeechResult: ...
