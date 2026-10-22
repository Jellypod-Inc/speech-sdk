import type { ModelInfo } from "@speech-sdk/core/types";
import { providerRegistry } from "./provider-registry";

function hasFeature(model: ModelInfo, id: string): boolean {
	return model.features.some((f) =>
		typeof f === "string" ? f === id : f.id === id,
	);
}

export type Model = ModelInfo & {
	provider: string;
	providerIcon: string;
	providerIconInvert: string;
	model: string;
	languages: string[];
	streaming: boolean;
	audioTags: boolean;
	inlineVoiceCloning: boolean;
	openSource: boolean;
};

export const models: Model[] = providerRegistry.flatMap(
	({ name, icon, iconInvert, prefix, factory }) => {
		const instance = factory();
		const providerObj = instance().provider;
		return providerObj.models.map((m) => {
			const modelId = `${prefix}/${m.id}`;
			return {
				...m,
				languages: [...m.languages],
				provider: name,
				providerIcon: icon,
				providerIconInvert: iconInvert,
				model: modelId,
				streaming: hasFeature(m, "streaming"),
				audioTags: hasFeature(m, "audio-tags"),
				inlineVoiceCloning: hasFeature(m, "inline-voice-cloning"),
				openSource: hasFeature(m, "open-source"),
			};
		});
	},
);

export const providers = [...new Set(models.map((m) => m.provider))];
