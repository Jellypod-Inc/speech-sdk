import {
	ArrowsClockwise,
	BookOpen,
	ChatsCircle,
	Clock,
	ClosedCaptioning,
	FileAudio,
	Gauge,
	Microphone,
	Plugs,
	RowsPlusBottom,
	SlidersHorizontal,
	SpeakerHigh,
	Tag,
	Translate,
	WarningCircle,
	Waveform,
} from "@phosphor-icons/react/dist/ssr";

interface Capability {
	icon: typeof Plugs;
	label: string;
}

const features: {
	icon: typeof Plugs;
	title: string;
	description: string;
	capabilities: Capability[];
}[] = [
	{
		icon: Plugs,
		title: "One API, Every Provider",
		description:
			"One interface across OpenAI, ElevenLabs, Deepgram, Cartesia, Google, Mistral, Hume, and more. Unified model strings, consistent response format, BYO API keys.",
		capabilities: [
			{ icon: Waveform, label: "Streaming" },
			{ icon: ArrowsClockwise, label: "Auto-Retries" },
			{ icon: WarningCircle, label: "Error Handling" },
			{ icon: SlidersHorizontal, label: "Provider Options" },
		],
	},
	{
		icon: ChatsCircle,
		title: "Multi-Speaker Conversations",
		description:
			"Generate a multi-speaker conversation with a single API. Mix voices across providers in one call, with automatic volume leveling and turn stitching.",
		capabilities: [
			{ icon: Tag, label: "Audio Tags" },
			{ icon: Microphone, label: "Voice Cloning" },
			{ icon: BookOpen, label: "Pronunciations" },
			{ icon: SpeakerHigh, label: "Volume Leveling" },
			{ icon: Gauge, label: "Speed Control" },
		],
	},
	{
		icon: RowsPlusBottom,
		title: "Auto-Chunking & Timestamps",
		description:
			"Intelligently splits long inputs on sentence boundaries for providers with max input lengths.",
		capabilities: [
			{ icon: Translate, label: "Multilingual Splitter" },
			{ icon: Clock, label: "Timestamps" },
			{ icon: ClosedCaptioning, label: "SRT/VTT Captions" },
			{ icon: FileAudio, label: "Output Formats" },
		],
	},
];

export function FeatureCards() {
	return (
		<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
			{features.map((feature) => (
				<div
					className="group border border-border p-6 transition-colors hover:border-primary"
					key={feature.title}
				>
					<div className="flex size-10 items-center justify-center border border-border">
						<feature.icon className="size-5 text-muted-foreground group-hover:text-primary" />
					</div>
					<h3 className="mt-4 font-semibold text-sm">{feature.title}</h3>
					<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
						{feature.description}
					</p>
					<div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-2">
						{feature.capabilities.map((cap) => (
							<div
								className="flex items-center gap-1.5 text-muted-foreground text-xs"
								key={cap.label}
							>
								<cap.icon className="size-3.5 shrink-0" />
								<span>{cap.label}</span>
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	);
}
