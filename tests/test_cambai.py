import pytest
from dotenv import load_dotenv
load_dotenv()
from route_tts import TTS, SpeechBlock
from route_tts.voices import CambAIVoice
import os

OUTPUT_DIR = "output/cambai"

voice_a = CambAIVoice(
    id="test_cambai_voice_a",
    voice_model="mars-flash",
    voice=156554,
    language="en-us"
)

voice_b = CambAIVoice(
    id="test_cambai_voice_b",
    voice_model="mars-flash",
    voice=156554,
    language="en-us"
)

tts_client = TTS(voices=[voice_a, voice_b])

@pytest.mark.asyncio
async def test_generate_cambai_speech():
    assert os.getenv("CAMB_API_KEY"), "CAMB_API_KEY must be set in environment variables"

    speech_block = SpeechBlock(
        voice_id="test_cambai_voice_a",
        text="Hello, this is a test of the CAMB AI text-to-speech functionality."
    )

    audio_segment = tts_client.generate_speech(speech_block)

    assert len(audio_segment) > 0, "No audio data was generated"

    save_audio_segment("test_output_single.mp3", audio_segment)

@pytest.mark.asyncio
async def test_generate_multiple_cambai_speech():
    assert os.getenv("CAMB_API_KEY"), "CAMB_API_KEY must be set in environment variables"

    speech_block_a = SpeechBlock(
        voice_id="test_cambai_voice_a",
        text="Hello, this is a test of the CAMB AI text-to-speech functionality."
    )

    speech_block_b = SpeechBlock(
        voice_id="test_cambai_voice_b",
        text="And this is the rest of the speaking using a different voice."
    )

    audio_segment = tts_client.generate_speech_list([speech_block_a, speech_block_b])
    assert len(audio_segment) > 0, "No audio data was generated"
    save_audio_segment("test_output_multiple.mp3", audio_segment)

@pytest.mark.asyncio
async def test_generate_cambai_speech_normalized():
    assert os.getenv("CAMB_API_KEY"), "CAMB_API_KEY must be set in environment variables"

    speech_block_a = SpeechBlock(
        voice_id="test_cambai_voice_a",
        text="I'm normally a bit quieter of a voice, but after normalizing, it should be better!"
    )

    speech_block_b = SpeechBlock(
        voice_id="test_cambai_voice_b",
        text="Yes this is great. I can hear you much better now"
    )

    speech_block_c = SpeechBlock(
        voice_id="test_cambai_voice_a",
        text="Perfect - we're all good to go!"
    )

    audio_segment = tts_client.generate_speech_list([speech_block_a, speech_block_b, speech_block_c], normalize_outputs=True)
    assert len(audio_segment) > 0, "No audio data was generated"
    save_audio_segment("test_output_multiple_normalized.mp3", audio_segment)

def save_audio_segment(name: str, audio_segment):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    output_file = os.path.join(OUTPUT_DIR, name)
    audio_segment.export(output_file, format="mp3")

    print(f"Audio saved to {name} for manual verification")
