import { providerRegistry } from "@/data/index";

export function ProviderModels({ prefix }: { prefix: string }) {
	const entry = providerRegistry.find((provider) => provider.prefix === prefix);
	if (!entry) {
		return null;
	}
	const { provider } = entry.factory()();
	return (
		<div className="my-6 min-w-0 overflow-x-auto">
			<table>
				<thead>
					<tr>
						<th>Model</th>
						<th>SDK default</th>
						<th>Features</th>
						<th>Input limit</th>
					</tr>
				</thead>
				<tbody>
					{provider.models.map((model) => (
						<tr key={model.id}>
							<td>
								<code>{model.id}</code>
							</td>
							<td>{model.id === provider.defaultModel ? "Yes" : "-"}</td>
							<td>
								{model.features
									.map((feature) =>
										typeof feature === "string" ? feature : feature.id,
									)
									.join(", ") || "Speech generation"}
							</td>
							<td>
								{model.maxInputChars?.toLocaleString("en-US") ??
									"Provider-defined"}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

const PROVIDER_ENV_VARS: Record<string, string> = {
	"fal-ai": "FAL_API_KEY",
	"fish-audio": "FISH_AUDIO_API_KEY",
	"smallest-ai": "SMALLEST_API_KEY",
};

export function ProviderOverview() {
	return (
		<div className="my-6 min-w-0 overflow-x-auto">
			<table>
				<thead>
					<tr>
						<th>Provider</th>
						<th>Prefix</th>
						<th>SDK default</th>
						<th>Environment variable</th>
					</tr>
				</thead>
				<tbody>
					{providerRegistry.map(({ prefix, name, factory }) => (
						<tr key={prefix}>
							<td>{name}</td>
							<td>
								<code>{prefix}</code>
							</td>
							<td>
								<code>
									{factory()().provider.defaultModel || "User-specified"}
								</code>
							</td>
							<td>
								<code>
									{PROVIDER_ENV_VARS[prefix] ??
										`${prefix.toUpperCase()}_API_KEY`}
								</code>
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

export function ProviderCapabilities() {
	const features = [
		"streaming",
		"audio-tags",
		"voice-cloning",
		"timestamps",
		"open-source",
	];
	return (
		<div className="my-6 min-w-0 overflow-x-auto">
			<table>
				<thead>
					<tr>
						<th>Provider</th>
						{features.map((feature) => (
							<th key={feature}>{feature}</th>
						))}
					</tr>
				</thead>
				<tbody>
					{providerRegistry.map(({ prefix, name, factory }) => {
						const { models } = factory()().provider;
						return (
							<tr key={prefix}>
								<td>{name}</td>
								{features.map((feature) => (
									<td key={feature}>
										{models.some((model) =>
											model.features.some(
												(entry) =>
													(typeof entry === "string" ? entry : entry.id) ===
													feature,
											),
										)
											? "Yes"
											: "-"}
									</td>
								))}
							</tr>
						);
					})}
				</tbody>
			</table>
		</div>
	);
}
