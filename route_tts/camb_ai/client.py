import os
from typing import Optional

from camb.client import CambAI


class CambAIClient:
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("CAMB_API_KEY")
        if not self.api_key:
            raise ValueError("No API key provided. Please provide an API key or set the CAMB_API_KEY environment variable.")
        self.client = CambAI(api_key=self.api_key)

    def generate_speech(self, text: str, voice_id: int, model_id: str, language: str) -> bytes:
        response_iter = self.client.text_to_speech.tts(
            text=text,
            voice_id=voice_id,
            speech_model=model_id,
            language=language,
        )
        return b"".join(response_iter)
