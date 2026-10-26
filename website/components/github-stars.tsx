import { Star } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { GitHubIcon } from "@/components/github-icon";
import { getStarCount } from "@/lib/github";

export async function GitHubStars() {
	const stars = await getStarCount();

	return (
		<Link
			className="flex items-center gap-2 text-muted-foreground text-sm transition-colors hover:text-foreground"
			href="https://github.com/Jellypod-Inc/speech-sdk"
			target="_blank"
		>
			<GitHubIcon className="size-4" />
			{stars !== null && stars >= 500 && (
				<span className="hidden items-center gap-1 border border-border px-1.5 py-0.5 font-mono text-xs sm:flex">
					<Star className="text-yellow-500" size={12} weight="fill" />
					{stars}
				</span>
			)}
		</Link>
	);
}
