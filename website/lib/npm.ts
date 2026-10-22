export async function getMonthlyDownloads(): Promise<number | null> {
	try {
		const response = await fetch(
			"https://api.npmjs.org/downloads/point/last-month/@speech-sdk/core",
			{ next: { revalidate: 3600 }, signal: AbortSignal.timeout(3000) },
		);
		if (!response.ok) {
			return null;
		}
		const data: unknown = await response.json();
		if (
			typeof data === "object" &&
			data !== null &&
			"downloads" in data &&
			typeof data.downloads === "number" &&
			Number.isSafeInteger(data.downloads) &&
			data.downloads >= 0
		) {
			return data.downloads;
		}
		return null;
	} catch {
		return null;
	}
}
