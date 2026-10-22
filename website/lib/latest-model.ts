export function latestModel<T extends { releaseDate: string }>(
	models: readonly T[],
): T | undefined {
	return models.reduce<T | undefined>((latest, model) => {
		if (!latest) {
			return model;
		}
		const latestDate = Date.parse(latest.releaseDate) || 0;
		const modelDate = Date.parse(model.releaseDate) || 0;
		return modelDate > latestDate ? model : latest;
	}, undefined);
}
