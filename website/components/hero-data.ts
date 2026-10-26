import {
	createCartesia,
	createElevenLabs,
	createGoogle,
	createInworld,
	createOpenAI,
	createXai,
} from "@speech-sdk/core/providers";
import { providerRegistry } from "@/data/index";
import {
	providerLogoInvertClass,
	providerLogos,
	type StaticImageData,
} from "@/shared/ui/assets/providers";
import { latestModel } from "../lib/latest-model";

export type Provider =
	| "openai"
	| "elevenlabs"
	| "cartesia"
	| "google"
	| "xai"
	| "inworld";

function newestModelId(provider: {
	models: readonly { id: string; releaseDate: string }[];
}): string {
	const model = latestModel(provider.models);
	if (!model) {
		throw new Error("Provider exposes no models");
	}
	return model.id;
}

export interface ProviderMeta {
	icon: StaticImageData;
	iconInvert: string;
	id: Provider;
	label: string;
	mediaType: string;
	modelId: string;
	prefix: string;
	voiceLiteral: string;
}

export const providers: ProviderMeta[] = [
	{
		id: "openai",
		label: "OpenAI",
		prefix: "openai",
		modelId: newestModelId(createOpenAI()().provider),
		voiceLiteral: "'alloy'",
		mediaType: "audio/mpeg",
		icon: providerLogos.openai,
		iconInvert: providerLogoInvertClass("openai"),
	},
	{
		id: "elevenlabs",
		label: "ElevenLabs",
		prefix: "elevenlabs",
		modelId: newestModelId(createElevenLabs()().provider),
		voiceLiteral: "'EXAVITQu4vr4xnSDxMaL'",
		mediaType: "audio/mpeg",
		icon: providerLogos.elevenlabs,
		iconInvert: providerLogoInvertClass("elevenlabs"),
	},
	{
		id: "cartesia",
		label: "Cartesia",
		prefix: "cartesia",
		modelId: newestModelId(createCartesia()().provider),
		voiceLiteral: "'a0e99841-438c-4a64-b679-ae501e7d6091'",
		mediaType: "audio/mpeg",
		icon: providerLogos.cartesia,
		iconInvert: providerLogoInvertClass("cartesia"),
	},
	{
		id: "google",
		label: "Google",
		prefix: "google",
		modelId: newestModelId(createGoogle()().provider),
		voiceLiteral: "'Kore'",
		mediaType: "audio/wav",
		icon: providerLogos.google,
		iconInvert: providerLogoInvertClass("google"),
	},
	{
		id: "xai",
		label: "xAI",
		prefix: "xai",
		modelId: newestModelId(createXai()().provider),
		voiceLiteral: "'ava'",
		mediaType: "audio/mpeg",
		icon: providerLogos.xai,
		iconInvert: providerLogoInvertClass("xai"),
	},
	{
		id: "inworld",
		label: "Inworld",
		prefix: "inworld",
		modelId: newestModelId(createInworld()().provider),
		voiceLiteral: "'Ashley'",
		mediaType: "audio/mpeg",
		icon: providerLogos.inworld,
		iconInvert: providerLogoInvertClass("inworld"),
	},
];

export const extraProviderCount = Math.max(
	0,
	providerRegistry.length - providers.length,
);

function buildSnippet(p: ProviderMeta): string {
	return `import { generateSpeech } from '@speech-sdk/core';

const result = await generateSpeech({
  model: '${p.prefix}/${p.modelId}',
  text: 'Hello from SpeechSDK!',
  voice: ${p.voiceLiteral},
});

result.audio.uint8Array;  // Uint8Array
result.audio.base64;      // string (lazy)
result.audio.mediaType;   // "${p.mediaType}"`;
}

export const providerCode: Record<Provider, string> = Object.fromEntries(
	providers.map((p) => [p.id, buildSnippet(p)]),
) as Record<Provider, string>;
