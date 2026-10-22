import * as sdkProviders from "@speech-sdk/core/providers";
import type { ResolvedModel } from "@speech-sdk/core/types";
import {
	type ProviderLogoKey,
	providerLogoInvertClass,
	providerLogos,
} from "@/shared/ui/assets/providers";

export type ProviderFactory = (config?: {
	apiKey?: string;
}) => (modelId?: string) => ResolvedModel;

export interface ProviderEntry {
	factory: ProviderFactory;
	icon: string;
	// Tailwind classes to keep monochrome marks legible across themes. Empty for
	// self-contained logos.
	iconInvert: string;
	name: string;
	prefix: string;
}

const DISPLAY_NAMES: Partial<Record<string, string>> = {
	elevenlabs: "ElevenLabs",
	"fal-ai": "fal",
	"fish-audio": "Fish Audio",
	openai: "OpenAI",
	heygen: "HeyGen",
	minimax: "MiniMax",
	speechify: "Speechify",
	"smallest-ai": "Smallest AI",
	xai: "xAI",
};

const ICON_DOMAINS: Partial<Record<string, string>> = {
	cartesia: "cartesia.ai",
	deepgram: "deepgram.com",
	elevenlabs: "elevenlabs.io",
	"fal-ai": "fal.ai",
	"fish-audio": "fish.audio",
	google: "google.com",
	hume: "hume.ai",
	heygen: "heygen.com",
	gradium: "gradium.ai",
	minimax: "minimax.io",
	speechify: "speechify.ai",
	inworld: "inworld.ai",
	mistral: "mistral.ai",
	murf: "murf.ai",
	openai: "openai.com",
	resemble: "resemble.ai",
	"smallest-ai": "smallest.ai",
	xai: "x.ai",
};

const PREFERRED_ORDER = [
	"openai",
	"elevenlabs",
	"deepgram",
	"cartesia",
	"hume",
	"inworld",
	"google",
	"fish-audio",
	"murf",
	"resemble",
	"smallest-ai",
	"fal-ai",
	"mistral",
	"xai",
] as const;

// Provider prefixes whose logo asset is filed under a different key.
const LOGO_KEYS: Partial<Record<string, ProviderLogoKey>> = {
	"fal-ai": "fal",
	"fish-audio": "fish",
	"smallest-ai": "smallest",
};

function logoKeyFor(id: string): ProviderLogoKey | undefined {
	const mapped = LOGO_KEYS[id];
	if (mapped) {
		return mapped;
	}
	return Object.hasOwn(providerLogos, id) ? (id as ProviderLogoKey) : undefined;
}

// Only used for providers we don't yet ship a bundled logo for; known providers
// resolve to a local asset so the runtime never hits a third-party favicon host.
function favicon(domain: string): string {
	return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
}

function displayName(id: string): string {
	return (
		DISPLAY_NAMES[id] ??
		id
			.split("-")
			.map((part) => part[0]?.toUpperCase() + part.slice(1))
			.join(" ")
	);
}

function iconFor(id: string): string {
	const key = logoKeyFor(id);
	if (key) {
		return providerLogos[key].src;
	}
	return favicon(ICON_DOMAINS[id] ?? `${id}.com`);
}

function iconInvertFor(id: string): string {
	const key = logoKeyFor(id);
	return key ? providerLogoInvertClass(key) : "";
}

function isProviderFactory(
	entry: [string, unknown],
): entry is [string, ProviderFactory] {
	const [name, value] = entry;
	return (
		name.startsWith("create") &&
		name !== "createSpeechGateway" &&
		typeof value === "function"
	);
}

function orderOf(id: string): number {
	const index = PREFERRED_ORDER.indexOf(id as (typeof PREFERRED_ORDER)[number]);
	return index === -1 ? Number.POSITIVE_INFINITY : index;
}

export const providerRegistry: ProviderEntry[] = [
	...new Map(
		Object.entries(sdkProviders)
			.filter(isProviderFactory)
			.map(([, factory]) => {
				const prefix = factory()().provider.id;
				const entry: ProviderEntry = {
					factory,
					icon: iconFor(prefix),
					iconInvert: iconInvertFor(prefix),
					name: displayName(prefix),
					prefix,
				};
				return [prefix, entry] as const;
			}),
	).values(),
].sort((a, b) => {
	const orderDelta = orderOf(a.prefix) - orderOf(b.prefix);
	return Number.isNaN(orderDelta) || orderDelta === 0
		? a.name.localeCompare(b.name)
		: orderDelta;
});

export const providerIds = providerRegistry.map((p) => p.prefix);
