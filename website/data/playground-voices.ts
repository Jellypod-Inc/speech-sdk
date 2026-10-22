export interface VoiceOption {
	id: string;
	label: string;
}

/** The shape of the static fallback voice map: provider prefix → voice options. */
export type PlaygroundVoiceTable = Record<string, VoiceOption[]>;

export const playgroundVoices: PlaygroundVoiceTable = {
	openai: [
		{ id: "alloy", label: "Alloy" },
		{ id: "ash", label: "Ash" },
		{ id: "ballad", label: "Ballad" },
		{ id: "coral", label: "Coral" },
		{ id: "echo", label: "Echo" },
		{ id: "fable", label: "Fable" },
		{ id: "nova", label: "Nova" },
		{ id: "onyx", label: "Onyx" },
		{ id: "sage", label: "Sage" },
		{ id: "shimmer", label: "Shimmer" },
		{ id: "verse", label: "Verse" },
	],
	elevenlabs: [
		{ id: "JBFqnCBsd6RMkjVDRZzb", label: "George" },
		{ id: "IKne3meq5aSn9XLyUdCD", label: "Charlie" },
		{ id: "XB0fDUnXU5powFXDhCwa", label: "Charlotte" },
		{ id: "Xb7hH8MSUJpSbSDYk0k2", label: "Alice" },
		{ id: "iP95p4xoKVk53GoZ742B", label: "Chris" },
		{ id: "nPczCjzI2devNBz1zQrb", label: "Brian" },
		{ id: "onwK4e9ZLuTAKqWW03F9", label: "Daniel" },
		{ id: "pFZP5JQG7iQjIQuC4Bku", label: "Lily" },
		{ id: "pqHfZKP75CvOlQylNhV4", label: "Bill" },
	],
	deepgram: [
		{ id: "aura-asteria-en", label: "Asteria" },
		{ id: "aura-luna-en", label: "Luna" },
		{ id: "aura-stella-en", label: "Stella" },
		{ id: "aura-athena-en", label: "Athena" },
		{ id: "aura-hera-en", label: "Hera" },
		{ id: "aura-orion-en", label: "Orion" },
		{ id: "aura-arcas-en", label: "Arcas" },
		{ id: "aura-perseus-en", label: "Perseus" },
		{ id: "aura-angus-en", label: "Angus" },
		{ id: "aura-orpheus-en", label: "Orpheus" },
		{ id: "aura-helios-en", label: "Helios" },
		{ id: "aura-zeus-en", label: "Zeus" },
	],
	cartesia: [
		{ id: "a0e99841-438c-4a64-b679-ae501e7d6091", label: "Barbershop Man" },
		{ id: "156fb8d2-335b-4950-9cb3-a2d33f0c0c2a", label: "British Lady" },
		{ id: "694f9389-aac1-45b6-b726-9d9369183238", label: "California Girl" },
		{ id: "87748186-23bb-4571-8b8b-a73da9bf9c4f", label: "Commercial Lady" },
		{ id: "41534e16-2966-4c6b-9670-111411def906", label: "Doctor Maitland" },
		{
			id: "ee7ea9f8-c0c1-498c-9f62-dc2da49a6f98",
			label: "Friendly Reading Man",
		},
		{ id: "248be419-c632-4f23-adf1-5324ed7dbf1d", label: "Hannah" },
		{ id: "c45bc5ec-dc68-4feb-8829-6e6b2748095d", label: "Movieman" },
	],
	google: [
		{ id: "Kore", label: "Kore" },
		{ id: "Puck", label: "Puck" },
		{ id: "Zephyr", label: "Zephyr" },
		{ id: "Charon", label: "Charon" },
		{ id: "Aoede", label: "Aoede" },
		{ id: "Fenrir", label: "Fenrir" },
		{ id: "Orus", label: "Orus" },
		{ id: "Leda", label: "Leda" },
		{ id: "Achernar", label: "Achernar" },
		{ id: "Sulafat", label: "Sulafat" },
		{ id: "Algieba", label: "Algieba" },
		{ id: "Callirrhoe", label: "Callirrhoe" },
		{ id: "Despina", label: "Despina" },
		{ id: "Enceladus", label: "Enceladus" },
	],
	hume: [
		{ id: "KORA", label: "Kora" },
		{ id: "AURA", label: "Aura" },
		{ id: "STELLA", label: "Stella" },
		{ id: "DACHER", label: "Dacher" },
	],
	"fish-audio": [{ id: "default", label: "Default" }],
	mistral: [{ id: "default", label: "Default" }],
	resemble: [{ id: "default", label: "Default" }],
	"fal-ai": [{ id: "default", label: "Default" }],
	inworld: [
		{ id: "Ashley", label: "Ashley" },
		{ id: "Dominus", label: "Dominus" },
		{ id: "Edward", label: "Edward" },
		{ id: "Hades", label: "Hades" },
		{ id: "Priya", label: "Priya" },
	],
	murf: [
		{ id: "en-US-natalie", label: "Natalie" },
		{ id: "en-US-marcus", label: "Marcus" },
	],
};

const fallbackVoices: VoiceOption[] = [{ id: "default", label: "Default" }];

/** Models that only accept a subset of their provider's voice catalog.
 * Anything not listed here uses the full provider list. */
const MODEL_VOICE_FILTERS: Record<string, ReadonlySet<string>> = {
	"openai/tts-1": new Set([
		"alloy",
		"ash",
		"coral",
		"echo",
		"fable",
		"nova",
		"onyx",
		"sage",
		"shimmer",
	]),
	"openai/tts-1-hd": new Set([
		"alloy",
		"ash",
		"coral",
		"echo",
		"fable",
		"nova",
		"onyx",
		"sage",
		"shimmer",
	]),
};

function providerPrefixOf(fullModelId: string): string {
	const slash = fullModelId.indexOf("/");
	return slash === -1 ? fullModelId : fullModelId.slice(0, slash);
}

export function getVoicesForProvider(providerPrefix: string): VoiceOption[] {
	return playgroundVoices[providerPrefix] ?? fallbackVoices;
}

export function getDefaultVoice(providerPrefix: string): string {
	const voices = getVoicesForProvider(providerPrefix);
	return voices[0]?.id ?? "default";
}

export function getVoicesForModel(fullModelId: string): VoiceOption[] {
	const prefix = providerPrefixOf(fullModelId);
	const all = playgroundVoices[prefix] ?? fallbackVoices;
	const filter = MODEL_VOICE_FILTERS[fullModelId];
	if (!filter) {
		return all;
	}
	return all.filter((v) => filter.has(v.id));
}

export function getDefaultVoiceForModel(fullModelId: string): string {
	const voices = getVoicesForModel(fullModelId);
	return voices[0]?.id ?? "default";
}

export function isVoiceSupportedByModel(
	fullModelId: string,
	voice: string,
): boolean {
	return getVoicesForModel(fullModelId).some((v) => v.id === voice);
}
