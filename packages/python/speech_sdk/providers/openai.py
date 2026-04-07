"""OpenAI TTS provider — mirrors src/providers/openai/."""

from __future__ import annotations

from dataclasses import dataclass

import httpx

from ..provider_utils import handle_error_response, resolve_api_key
from ..speech_provider import SpeechRequest
from ..speech_result import GeneratedAudioFile, SpeechResult

_DEFAULT_BASE_URL = "https://api.openai.com/v1"
_DEFAULT_VOICE = "alloy"


@dataclass
class OpenAISpeechModel:
    api_key: str
    base_url: str = _DEFAULT_BASE_URL
    name: str = "openai"

    async def generate(self, request: SpeechRequest) -> SpeechResult:
        model_id = request.provider_options.get("model", "tts-1")
        payload = {
            "model": model_id,
            "input": request.text,
            "voice": request.voice or _DEFAULT_VOICE,
            "response_format": request.output_format or "mp3",
        }

        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.post(
                f"{self.base_url}/audio/speech",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            handle_error_response(response, "openai")

            return SpeechResult(
                audio=GeneratedAudioFile(
                    data=response.content,
                    media_type=f"audio/{payload['response_format']}",
                ),
                model_id=model_id,
                provider=self.name,
            )


def create_openai(
    *, api_key: str | None = None, base_url: str = _DEFAULT_BASE_URL
) -> OpenAISpeechModel:
    return OpenAISpeechModel(
        api_key=resolve_api_key(api_key=api_key, env_var="OPENAI_API_KEY", provider="openai"),
        base_url=base_url,
    )
