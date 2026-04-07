"""ElevenLabs TTS provider — mirrors src/providers/elevenlabs/."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from ..provider_utils import handle_error_response, resolve_api_key
from ..speech_provider import SpeechRequest
from ..speech_result import GeneratedAudioFile, SpeechResult

_DEFAULT_BASE_URL = "https://api.elevenlabs.io/v1"
_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM"  # Rachel


@dataclass
class ElevenLabsSpeechModel:
    api_key: str
    base_url: str = _DEFAULT_BASE_URL
    name: str = "elevenlabs"

    async def generate(self, request: SpeechRequest) -> SpeechResult:
        model_id = request.provider_options.get("model", "eleven_multilingual_v2")
        voice = request.voice or _DEFAULT_VOICE
        output_format = request.output_format or "mp3_44100_128"

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/text-to-speech/{voice}",
                headers={
                    "xi-api-key": self.api_key,
                    "Content-Type": "application/json",
                    "Accept": "audio/mpeg",
                },
                params={"output_format": output_format},
                json={"text": request.text, "model_id": model_id},
            )
            handle_error_response(response, "elevenlabs")

            return SpeechResult(
                audio=GeneratedAudioFile(data=response.content, media_type="audio/mpeg"),
                model_id=model_id,
                provider=self.name,
            )


def create_elevenlabs(
    *, api_key: str | None = None, base_url: str = _DEFAULT_BASE_URL
) -> ElevenLabsSpeechModel:
    return ElevenLabsSpeechModel(
        api_key=resolve_api_key(
            api_key=api_key, env_var="ELEVENLABS_API_KEY", provider="elevenlabs"
        ),
        base_url=base_url,
    )
