import { ArrowUpRight, Star } from "@phosphor-icons/react/dist/ssr";
import type * as PageTree from "fumadocs-core/page-tree";
import Link from "next/link";
// import { GeminiBanner } from "@/components/gemini-banner";
import { GitHubIcon } from "@/components/github-icon";
import { NavLink } from "@/components/nav-link";
import { SpeechSDKLogo } from "@/components/speech-sdk-logo";
import { getStarCount } from "@/lib/github";
import { DocsMobileNav } from "@/shared/docs/components/docs-mobile-nav";

const GITHUB_URL = "https://github.com/Jellypod-Inc/speech-sdk";
const JELLYPOD_URL = "https://jellypod.com";

const SDK_NAV_LINKS = [
	{ label: "Docs", href: "/docs" },
	{ label: "Models", href: "/models" },
];

function PoweredByJellypodButton({
	className,
	iconClassName,
}: {
	className: string;
	iconClassName: string;
}) {
	return (
		<Link
			className={className}
			href={JELLYPOD_URL}
			rel="noopener noreferrer"
			target="_blank"
		>
			<span>Powered by Jellypod</span>
			<ArrowUpRight className={iconClassName} />
		</Link>
	);
}

function GitHubStarButton({
	stars,
	className,
	iconClassName,
	starSize,
}: {
	stars: number | null;
	className: string;
	iconClassName: string;
	starSize: number;
}) {
	return (
		<Link
			className={className}
			href={GITHUB_URL}
			rel="noopener noreferrer"
			target="_blank"
		>
			<GitHubIcon className={iconClassName} />
			<span>GitHub</span>
			{stars !== null && stars >= 500 && (
				<span className="inline-flex items-center gap-1">
					<span className="text-muted-foreground/40">|</span>
					<Star className="text-yellow-400" size={starSize} weight="fill" />
					{stars}
				</span>
			)}
		</Link>
	);
}

export async function Nav({ tree }: { tree?: PageTree.Root }) {
	const stars = await getStarCount();

	return (
		<>
			{/* <GeminiBanner /> */}
			<header className="sticky top-0 z-50 w-full border-border border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
				<div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4 sm:px-6">
					<div className="flex items-center gap-6">
						<Link className="transition-opacity hover:opacity-70" href="/">
							<SpeechSDKLogo />
						</Link>
						<NavLink className="hidden md:inline" href="/docs">
							Docs
						</NavLink>
						<NavLink className="hidden md:inline" href="/models">
							Models
						</NavLink>
					</div>

					<div className="flex items-center gap-3">
						<GitHubStarButton
							className="hidden shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border border-border bg-background px-2.5 py-1 font-medium text-xs transition-all hover:bg-muted hover:text-foreground md:inline-flex"
							iconClassName="size-3.5"
							starSize={12}
							stars={stars}
						/>
						<PoweredByJellypodButton
							className="hidden shrink-0 items-center justify-center gap-1 whitespace-nowrap bg-primary px-2.5 py-1 font-medium text-primary-foreground text-xs transition-all hover:bg-primary/80 md:inline-flex"
							iconClassName="size-3.5"
						/>
						<DocsMobileNav
							actions={
								<>
									<PoweredByJellypodButton
										className="inline-flex w-full items-center justify-center gap-1.5 bg-primary px-3 py-2 font-medium text-primary-foreground text-sm transition-all hover:bg-primary/80"
										iconClassName="size-4"
									/>
									<GitHubStarButton
										className="inline-flex w-full items-center justify-center gap-1.5 border border-border bg-background px-3 py-2 font-medium text-foreground text-sm transition-all hover:bg-muted"
										iconClassName="size-4"
										starSize={14}
										stars={stars}
									/>
								</>
							}
							links={SDK_NAV_LINKS}
							logo={<SpeechSDKLogo />}
							tree={tree}
							triggerClassName="md:hidden"
						/>
					</div>
				</div>
			</header>
		</>
	);
}
