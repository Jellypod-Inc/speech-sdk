import cartesia from "./providers/cartesia.png";
import deepgram from "./providers/deepgram.png";
import elevenlabs from "./providers/elevenlabs.png";
import fal from "./providers/fal.png";
import fish from "./providers/fish.png";
import google from "./providers/google.png";
import hume from "./providers/hume.png";
import inworld from "./providers/inworld.png";
import minimax from "./providers/minimax.png";
import mistral from "./providers/mistral.png";
import murf from "./providers/murf.png";
import openai from "./providers/openai.png";
import resemble from "./providers/resemble.png";
import smallest from "./providers/smallest.png";
import xai from "./providers/xai.png";

// Structural type equivalent to next/image's StaticImageData — duplicated
// locally so this package has no hard dep on Next.js type declarations.
export interface StaticImageData {
	blurDataURL?: string;
	blurHeight?: number;
	blurWidth?: number;
	height: number;
	src: string;
	width: number;
}

interface ProviderLogos {
	cartesia: StaticImageData;
	deepgram: StaticImageData;
	elevenlabs: StaticImageData;
	fal: StaticImageData;
	fish: StaticImageData;
	google: StaticImageData;
	hume: StaticImageData;
	inworld: StaticImageData;
	minimax: StaticImageData;
	mistral: StaticImageData;
	murf: StaticImageData;
	openai: StaticImageData;
	resemble: StaticImageData;
	smallest: StaticImageData;
	xai: StaticImageData;
}

export const providerLogos: ProviderLogos = {
	cartesia,
	deepgram,
	elevenlabs,
	fal,
	fish,
	google,
	hume,
	inworld,
	minimax,
	mistral,
	murf,
	openai,
	resemble,
	smallest,
	xai,
};

export type ProviderLogoKey = keyof typeof providerLogos;

// A few brand marks are a single flat colour on a transparent background, so
// they disappear on surfaces that match their colour. These need theme-aware
// inversion: "dark" marks (dark on transparent) invert in dark mode; "light"
// marks (light on transparent) invert in light mode. Every other logo carries
// its own background or is multi-colour and renders untouched.
const monochromeMarkTone: Partial<Record<ProviderLogoKey, "dark" | "light">> = {
	cartesia: "dark",
	elevenlabs: "dark",
	fish: "light",
	openai: "dark",
	xai: "dark",
};

export function providerLogoInvertClass(key: ProviderLogoKey): string {
	const tone = monochromeMarkTone[key];
	if (tone === "dark") {
		return "dark:invert";
	}
	if (tone === "light") {
		return "invert dark:invert-0";
	}
	return "";
}
