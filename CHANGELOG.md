# Changelog

## 1.0.0 (2026-03-30)

Initial release — full rewrite from Python to TypeScript.

### Features

- `generateSpeech()` function with unified model strings (`openai/tts-1`, `elevenlabs/eleven_multilingual_v2`)
- OpenAI provider (`createOpenAI`) — default model `gpt-4o-mini-tts`
- ElevenLabs provider (`createElevenLabs`) — default model `eleven_multilingual_v2`, request stitching via `providerOptions`
- Type-safe provider options validated with Zod
- `GeneratedAudioFile` with lazy `base64`/`uint8Array` conversion
- Built-in retry via `p-retry` (skips 4xx, retries 5xx/network errors)
- Factory functions for custom API keys, base URLs, and fetch implementations
- Subpath exports: `speech-sdk/openai`, `speech-sdk/elevenlabs`
- Universal target (Node, Edge, Browser)
