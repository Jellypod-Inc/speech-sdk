from enum import Enum
from typing import Literal
from pydantic import BaseModel

class Platform(Enum):
    OPENAI = "OpenAI"
    ELEVENLABS = "ElevenLabs"
    CAMBAI = "CambAI"

class Voice(BaseModel):
    id: str
    platform: Platform

class OpenAIVoice(Voice):
    voice_model: str
    voice: str
    platform: Platform = Platform.OPENAI
    output_format: Literal["mp3", "opus", "aac", "flac", "wav", "pcm"] = "mp3"

class ElevenLabsVoice(Voice):
    voice_model: str
    voice: str
    platform: Platform = Platform.ELEVENLABS

class CambAIVoice(Voice):
    voice_model: str = "mars-flash"
    voice: int
    language: str = "en-us"
    platform: Platform = Platform.CAMBAI