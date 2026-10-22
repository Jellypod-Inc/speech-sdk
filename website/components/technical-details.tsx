import {
	ArrowsClockwise,
	ClosedCaptioning,
	FileAudio,
	Plugs,
	RowsPlusBottom,
	Waveform,
} from "@phosphor-icons/react/dist/ssr";
import type { ReactNode } from "react";

const Code = ({ children }: { children: string }) => (
	<code className="font-mono text-foreground">{children}</code>
);

// Keep this list at an even count so the 2-col grid never has a lone trailing
// tile. 6 is the soft cap — anything more dilutes the page.
const details: { icon: typeof Plugs; title: string; description: ReactNode }[] =
	[
		{
			icon: ArrowsClockwise,
			title: "Smart retries",
			description: (
				<>
					Jittered exponential backoff retries 5xx and 429 automatically. 429s
					honor <Code>Retry-After</Code> (60s cap) and expose the delay via{" "}
					<Code>ApiError.retryAfterMs</Code>.
				</>
			),
		},
		{
			icon: RowsPlusBottom,
			title: "Long inputs, handled",
			description: (
				<>
					<Code>maxInputChars</Code> splits at sentence boundaries, stitches
					chunks into one audio file, and reconnects word-level timestamps
					end-to-end.
				</>
			),
		},
		{
			icon: FileAudio,
			title: "Format conversions",
			description: (
				<>
					Render <Code>wav</Code>, <Code>mp3</Code>, or <Code>pcm</Code> from
					any provider. Native pass-through where supported, lossless local
					conversion otherwise.
				</>
			),
		},
		{
			icon: Plugs,
			title: "Custom fetch & Base URL",
			description: (
				<>
					Every provider accepts a custom <Code>fetch</Code> and{" "}
					<Code>baseURL</Code> — point at OpenAI-compatible proxies, Azure,
					LiteLLM, or local models.
				</>
			),
		},
		{
			icon: ClosedCaptioning,
			title: "Words and captions",
			description: (
				<>
					Word-level timestamps from native provider support or timestamp
					fallback. <Code>timestampsToCaptions</Code> ships SRT or WebVTT in a
					single call.
				</>
			),
		},
		{
			icon: Waveform,
			title: "Streaming",
			description: (
				<>
					<Code>streamSpeech</Code> returns a Web <Code>ReadableStream</Code> of
					audio bytes, so time-to-first-byte stays low in Node, Edge runtimes,
					and the browser.
				</>
			),
		},
	];

export function TechnicalDetails() {
	return (
		<section className="border-border border-t">
			<div className="mx-auto max-w-5xl px-6 py-24">
				<p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
					AI Engineering
				</p>
				<h2 className="mt-3 font-semibold text-2xl tracking-tight">
					For Production Voice Applications
				</h2>

				<div className="mt-10 grid gap-px border border-border bg-border md:grid-cols-2">
					{details.map((detail) => (
						<div className="flex gap-4 bg-background p-6" key={detail.title}>
							<div className="flex size-8 shrink-0 items-center justify-center border border-border">
								<detail.icon className="size-4 text-muted-foreground" />
							</div>
							<div>
								<h3 className="font-semibold text-sm">{detail.title}</h3>
								<p className="mt-1 text-muted-foreground text-sm leading-relaxed">
									{detail.description}
								</p>
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
