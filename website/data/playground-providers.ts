import type { ResolvedModel } from "@speech-sdk/core/types";
import type { ProviderEntry } from "./provider-registry";
import { providerRegistry } from "./provider-registry";

export type { ProviderEntry } from "./provider-registry";
export { providerIds, providerRegistry } from "./provider-registry";

export function getProviderByPrefix(prefix: string): ProviderEntry | undefined {
	return providerRegistry.find((p) => p.prefix === prefix);
}

export function parseModelId(fullModelId: string): {
	prefix: string;
	modelId: string;
} {
	const slashIndex = fullModelId.indexOf("/");
	if (slashIndex === -1) {
		return { prefix: fullModelId, modelId: "" };
	}
	return {
		prefix: fullModelId.slice(0, slashIndex),
		modelId: fullModelId.slice(slashIndex + 1),
	};
}

export function createResolvedModel(
	fullModelId: string,
	apiKey: string,
): ResolvedModel {
	const { prefix, modelId } = parseModelId(fullModelId);
	const entry = getProviderByPrefix(prefix);
	if (!entry) {
		throw new Error(`Unknown provider prefix: ${prefix}`);
	}
	return entry.factory({ apiKey })(modelId || undefined);
}
