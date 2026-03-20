# RouteTTS

**RouteTTS** is a flexible routing library for multiple GenAI text-to-speech (TTS) providers. It provides a unified interface to generate audio from text blocks and makes it easy to combine multiple TTS providers into a single audio file.

Supported TTS Platforms:
- [x] OpenAI
- [x] ElevenLabs
- [x] CAMB AI
- [ ] Play.HT *(Coming soon)*
- [ ] Amazon Polly *(Coming soon)*
- [ ] Deepgram *(Coming soon)*

*Please open an issue to suggest more!*

## Features

- Unified interface for multiple TTS providers
- Easy configuration of multiple voices and speech generation
- Audio normalization (prevents model output volumes from being noticably different)

**Planned features:**
- Automatic chunking to overcome input character limits.
- Speech generation optimizations.

## Installation

To install Route TTS, you need to have Poetry installed. If you don't have Poetry, you can install it by following the instructions [here](https://python-poetry.org/docs/#installation).

Once you have Poetry installed, clone this repository and install the dependencies:

```bash
poetry install
```

To include **RouteTTS** as a dependency, you just install it normally via pip.

```bash
pip install route-tts
```

## Usage
RouteTTS provides an extremely simple wrapper over the most common TTS model providers such as OpenAI and ElevenLabs (others coming soon).

You first initialize a `TTS` client with a list of `Voice` objects. Each `Voice` object contains information about the voice's platform, voice_model, and a unique voice identifier. Then, to generate audio, you create a `SpeechBlock` with a *id* and the *text* to convert to audio. That's it.

Now, you can just easily change the id and we'll handle the rest.

### API Keys for Speech Providers
To use **RouteTTS** in your project, you'll need to set up your API keys for the TTS providers you want to use.

Before running the application, you need to set up the following environment variables:

```
export OPENAI_API_KEY=your_openai_api_key_here
export ELEVEN_API_KEY=your_elevenlabs_api_key_here
export CAMB_API_KEY=your_camb_api_key_here
```

You can set these environment variables in your shell or add them to a `.env` file in the root directory of the project. Alternatively, you can pass the API keys directly when initializing the TTS client.

### Creating Voices
Create voices each with a unique identifiers. Here are examples for OpenAI and ElevenLabs voices:

#### OpenAI
As of August 30th, 2024, OpenAI has four voices: `alloy`, `echo`, `fable`, `onyx`, `nova`, and `shimmer`. They also have two voice_model: `tts-1` and `tts-1-hd`.
```
OpenAIVoice(
    id=<any_unique_id>
    voice=<alloy | echo | fable | onyx | nova | shimmer>
    voice_model: <tts-1 | tts-1-hd>
)
```

#### ElevenLabs
Refer to the ElevenLabs documentation to find your voice and associated voice_model and id.

```
ElevenLabsVoice(
    id=<any_unique_id>
    voice=<eleven labs voice id>
    voice_model: <eleven_multilingual_v1 | eleven_turbo_v2 | eleven_turbo_v2_5> // Others may have been released
)
```

#### CAMB AI
CAMB AI offers TTS via MARS models. Refer to the CAMB AI documentation for available voices and languages.

```
CambAIVoice(
    id=<any_unique_id>
    voice=<camb ai voice id (integer)>
    voice_model=<mars-flash | mars-pro | mars-instruct>
    language=<BCP-47 code, e.g. "en-us">
)
```

### TTS Instantiation
Initialize a `TTS` object with the voices you just created.

```
TTS(
    voices=[openai_voice, elevenlabs_voice],
)
```

### Creating Audio
Now, you can generate audio by creating a `SpeechBlock` object and calling `TTS().generate_audio()`

#### Single Audio SpeechBlock

```
# Create SpeechBlock object
speech_block = SpeechBlock(
    voice_id=<voice_id>,
    text="Some random text to convert to audio"
)

# Generate Audio
audio = TTS().generate_speech(speech_block)

# Save Audio file as .mp3
audio_file_path = "output_audio.mp3"
with open(audio_file_path, "wb") as audio_file:
    audio_file.write(audio)
```

#### Multiple SpeechBlock
We (*will soon*) handle optimization of converting multiple SpeechBlocks in a List. Certain providers (OpenAI) do not provide a way to maintain context and intonation across multiple requests which becomes embarassingly parallel. Other platforms like ElevenLabs does enable this so that a TTS request can know how the previous one ended, creating more natural sounding realism.

```
# Create SpeechBlock objects
speech_block_one = SpeechBlock(
    voice_id=<voice_id_one>,
    text="Some random text to convert to audio"
)

speech_block_two = SpeechBlock(
    voice_id=<voice_id_two>,
    text="Some more random text to convert to audio"
)

# Generate Audio
audio = TTS().generate_speech_list([speech_block_one, speech_block_two])

# Save Audio file as .mp3
audio_file_path = "output_audio.mp3"
with open(audio_file_path, "wb") as audio_file:
    audio_file.write(audio)
```

## Tests
You can run the test suite by:
```
poetry run pytest
```

## Feature List
- [ ] Add Deepgram audio provider
- [ ] Add Play.ht audio provider
- [ ] Add AWS Polly audio provider
- [ ] Enable multi-speaker conversation by passing a List of SpeechBlocks
- [ ] Generate all OpenAI SpeechBlocks in parrallel because there's no context awareness from block to block

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any problems or have any questions, please open an issue on the GitHub repository.