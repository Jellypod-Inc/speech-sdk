# speech-sdk (Python)

Python implementation of `@speech-sdk/core`. Mirrors the TypeScript public API.

```python
from speech_sdk import generate_speech

result = await generate_speech(
    model="openai/tts-1",
    text="Hello from Python",
)

with open("out.mp3", "wb") as f:
    f.write(result.audio.uint8_array)
```

## Install (dev)

```bash
cd packages/python
uv sync --extra dev   # or: pip install -e ".[dev]"
pytest
```

## Environment variables

- `OPENAI_API_KEY`
- `ELEVENLABS_API_KEY`
