import { SyntaxHighlight } from "@/shared/blocks/components/syntax-highlight";

const basicUsageCode = `import { generateSpeech } from '@speech-sdk/core';

const result = await generateSpeech({
  model: 'openai/gpt-4o-mini-tts',
  text: 'Hello from SpeechSDK!',
  voice: 'alloy',
});

// Access the audio
result.audio.uint8Array;  // Uint8Array
result.audio.base64;      // string (lazy)
result.audio.mediaType;   // "audio/mpeg"`;

const customConfigCode = `import { generateSpeech } from '@speech-sdk/core';
import { createOpenAI } from '@speech-sdk/core/providers';

const myOpenAI = createOpenAI({
  apiKey: 'sk-...',
  baseURL: 'https://my-proxy.com/v1',
});

const result = await generateSpeech({
  model: myOpenAI('gpt-4o-mini-tts'),
  text: 'Hello!',
  voice: 'alloy',
});`;

const examples = [
	{
		title: "Basic Usage",
		subtitle: "Generate speech with one function call",
		code: basicUsageCode,
	},
	{
		title: "Custom Configuration",
		subtitle: "Custom API keys, base URLs, and fetch implementations",
		code: customConfigCode,
	},
];

export function CodeExamples() {
	return (
		<section className="border-border border-t">
			<div className="mx-auto max-w-5xl px-6 py-24">
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
					EXAMPLES
				</p>
				<h2 className="mt-3 font-semibold text-2xl tracking-tight">
					Simple by default, flexible when you need it
				</h2>

				<div className="mt-10 grid gap-6 md:grid-cols-2">
					{examples.map((example) => (
						<div
							className="min-w-0 overflow-hidden border border-border p-6"
							key={example.title}
						>
							<h3 className="font-semibold text-sm">{example.title}</h3>
							<p className="mt-1 text-muted-foreground text-xs">
								{example.subtitle}
							</p>
							<div className="mt-4">
								<SyntaxHighlight
									code={example.code}
									lang="typescript"
									langBadge
								/>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
