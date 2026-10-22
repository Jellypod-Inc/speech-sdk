import { llms } from "fumadocs-core/source";
import { source } from "@/lib/source";

export const revalidate = false;

const INTRO = `# SpeechSDK

> The unified text-to-speech SDK for JavaScript and TypeScript. One open-source interface across OpenAI, ElevenLabs, Deepgram, Cartesia, Google, Hume, Mistral, and 10+ more providers — bring your own API keys.

SpeechSDK (\`@speech-sdk/core\`) is a free, open-source toolkit for building AI audio applications without locking into a single voice provider. Use the same \`generateSpeech\`, \`streamSpeech\`, and \`generateConversation\` calls across every supported provider.

## Features

- **One API, every provider** — unified model strings, consistent response format, BYO API keys. Includes streaming, auto-retries, error handling, and provider-specific options.
- **Multi-speaker conversations** — generate a multi-voice conversation in one call, mixing voices across providers, with automatic volume leveling and turn stitching.
- **Auto-chunking & timestamps** — sentence-boundary splitting for inputs that exceed a provider's per-request limit, word-level timestamps, and SRT/VTT caption export.
- **Voice cloning, audio tags, pronunciations, speed control** — supported on every provider that exposes them.

## Related

- [Jellypod](https://jellypod.com), the team that builds and maintains SpeechSDK.

`;

const DOCS_HEADING_RE = /^# Documentation/;

export function GET() {
	const docs = llms(source)
		.index()
		.replace(DOCS_HEADING_RE, "## Documentation");
	return new Response(INTRO + docs);
}
