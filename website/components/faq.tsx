import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/shared/ui/components/accordion";

const faqs = [
	{
		question: "How is this different from using provider SDKs directly?",
		answer:
			"Each provider has its own SDK, request format, auth pattern, and response shape. SpeechSDK is one API, every provider — same function call, same result type, same error handling. Switch providers by simply changing a model string.",
	},
	{
		question: "What's the difference between a model and a voice?",
		answer:
			"The model is the underlying TTS engine — it determines overall quality, naturalness, and supported features. The voice controls how that model sounds: the tone, accent, and character. Think of it as one model, many voices.\n\nThe tricky part is that every provider represents this differently — some use separate fields, others pack model, voice, and language into a single string. The SDK normalizes all of this so you always pass model and voice as distinct parameters.",
	},
	{
		question: "Do I need my own API keys?",
		answer:
			"Yes. The SDK routes requests through your own provider accounts. Set API keys via environment variables (OPENAI_API_KEY, ELEVENLABS_API_KEY, etc.) and they resolve automatically. Factory functions also accept explicit keys.",
	},
	{
		question: "Does it work in the browser?",
		answer:
			"Yes. The SDK uses standard fetch and Uint8Array — no Node-specific APIs. It runs in Node.js, Edge runtimes (Cloudflare Workers, Vercel Edge), and the browser. You can inject a custom fetch if needed.",
	},
	{
		question: "What audio formats are returned?",
		answer:
			"It depends on the provider. OpenAI returns MP3, Cartesia returns WAV/PCM, and others vary. The SDK reads the Content-Type header from each response so you always know the actual format via result.audio.mediaType.",
	},
	{
		question: "How does voice cloning work?",
		answer:
			"Providers that support cloning (like Mistral and fal) accept a voice object instead of a string — either { audio: 'base64...' } for inline audio or { url: 'https://...' } for a reference URL. The Voice type handles both.",
	},
];

export function Faq() {
	return (
		<section className="border-border border-t">
			<div className="mx-auto max-w-5xl px-6 py-24">
				<h2 className="font-semibold text-xl">Frequently asked questions</h2>
				<div className="mt-6 border border-border">
					<Accordion defaultValue={faqs[0] ? [faqs[0].question] : []}>
						{faqs.map((faq) => (
							<AccordionItem key={faq.question} value={faq.question}>
								<AccordionTrigger className="px-6 text-left font-medium text-sm">
									{faq.question}
								</AccordionTrigger>
								<AccordionContent className="px-6 text-muted-foreground text-sm">
									{faq.answer.split("\n\n").map((paragraph) => (
										<p key={paragraph}>{paragraph}</p>
									))}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</section>
	);
}
