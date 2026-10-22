import { DownloadSimple } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { getMonthlyDownloads } from "@/lib/npm";

export async function NpmDownloads() {
	const downloads = await getMonthlyDownloads();
	if (downloads === null) {
		return null;
	}
	return (
		<Link
			aria-label={`${downloads.toLocaleString("en-US")} npm downloads in the last month`}
			className="inline-flex min-h-9 items-center gap-2 border border-border px-3 py-1.5 font-mono text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
			href="https://www.npmjs.com/package/@speech-sdk/core"
			rel="noopener noreferrer"
			target="_blank"
		>
			<DownloadSimple aria-hidden="true" size={14} />
			<span>
				<span className="font-semibold text-foreground">
					{Intl.NumberFormat("en-US", {
						notation: "compact",
						maximumFractionDigits: 1,
					}).format(downloads)}
				</span>{" "}
				downloads / month
			</span>
		</Link>
	);
}
