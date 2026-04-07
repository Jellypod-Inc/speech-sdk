"""speech-sdk: universal TTS SDK with multi-provider support."""

from .generate_speech import generate_speech
from .speech_provider import SpeechProvider, SpeechRequest
from .speech_result import GeneratedAudioFile, SpeechResult

__all__ = [
    "GeneratedAudioFile",
    "SpeechProvider",
    "SpeechRequest",
    "SpeechResult",
    "generate_speech",
]
