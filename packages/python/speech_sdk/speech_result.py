"""Result types — mirrors src/speech-result.ts."""

from __future__ import annotations

import base64
from dataclasses import dataclass, field
from functools import cached_property


class GeneratedAudioFile:
    """Lazily exposes the audio bytes as base64, mirroring DefaultGeneratedAudioFile."""

    def __init__(self, data: bytes, media_type: str) -> None:
        self._data = data
        self.media_type = media_type

    @property
    def uint8_array(self) -> bytes:
        return self._data

    @cached_property
    def base64(self) -> str:
        return base64.b64encode(self._data).decode("ascii")


@dataclass
class SpeechResult:
    audio: GeneratedAudioFile
    model_id: str
    provider: str
    warnings: list[str] = field(default_factory=list)
    raw_response: dict | None = None
