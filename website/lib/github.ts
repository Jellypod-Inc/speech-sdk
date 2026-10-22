export async function getStarCount(): Promise<number | null> {
	try {
		const res = await fetch(
			"https://api.github.com/repos/Jellypod-Inc/speech-sdk",
			{ next: { revalidate: 3600 } },
		);
		const data = await res.json();
		return typeof data.stargazers_count === "number"
			? data.stargazers_count
			: null;
	} catch {
		return null;
	}
}
