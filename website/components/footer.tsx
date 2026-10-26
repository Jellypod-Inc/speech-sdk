"use client";

import {
	Desktop,
	LinkedinLogo,
	Moon,
	SpotifyLogo,
	Sun,
	XLogo,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { GitHubIcon } from "@/components/github-icon";

const footerLinks = {
	Product: [
		{ label: "Models", href: "/models" },
		{ label: "GitHub", href: "https://github.com/Jellypod-Inc/speech-sdk" },
		{ label: "npm", href: "https://www.npmjs.com/package/@speech-sdk/core" },
	],
	Resources: [
		{ label: "Documentation", href: "/docs" },
		{
			label: "Changelog",
			href: "https://github.com/Jellypod-Inc/speech-sdk/releases",
		},
	],
	Company: [
		{ label: "Jellypod", href: "https://jellypod.com" },
		{ label: "Contact", href: "/contact" },
	],
};

export function Footer() {
	const { theme, setTheme } = useTheme();
	const [mounted, setMounted] = useState(false);
	useEffect(() => setMounted(true), []);

	function cycleTheme() {
		const nextTheme: Record<string, string> = {
			light: "dark",
			dark: "system",
			system: "light",
		};
		setTheme(nextTheme[theme ?? "system"] ?? "light");
	}

	const themeIcons = { light: Sun, dark: Moon, system: Desktop };
	const ThemeIcon = mounted
		? (themeIcons[theme as keyof typeof themeIcons] ?? Desktop)
		: null;

	return (
		<footer className="dark mt-auto border-primary/20 border-t bg-background text-foreground">
			<div className="mx-auto max-w-5xl px-6 py-16">
				{/* Link columns */}
				<div className="grid grid-cols-2 gap-8 md:grid-cols-3">
					{Object.entries(footerLinks).map(([category, links]) => (
						<div key={category}>
							<h3 className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
								{category}
							</h3>
							<ul className="mt-4 space-y-2">
								{links.map((link) => (
									<li key={link.label}>
										<Link
											className="text-muted-foreground text-sm transition-colors hover:text-foreground"
											href={link.href}
											target={
												link.href.startsWith("http") ? "_blank" : undefined
											}
										>
											{link.label}
										</Link>
									</li>
								))}
							</ul>
						</div>
					))}
				</div>

				{/* Bottom bar */}
				<div className="mt-12 flex flex-col items-start justify-between gap-4 border-border border-t pt-6 text-muted-foreground text-xs sm:flex-row sm:items-center">
					<span>&copy; {new Date().getFullYear()} Jellypod, Inc.</span>
					<div className="flex items-center gap-4">
						<button
							aria-label="Toggle theme"
							className="flex size-11 items-center justify-center transition-colors hover:text-foreground"
							onClick={cycleTheme}
							type="button"
						>
							{ThemeIcon && <ThemeIcon className="size-4" />}
						</button>
						<span className="h-3 w-px bg-border" />
						<Link
							aria-label="SpeechSDK on GitHub"
							className="inline-flex min-h-11 min-w-8 items-center justify-center transition-colors hover:text-foreground"
							href="https://github.com/Jellypod-Inc/speech-sdk"
							rel="noopener noreferrer"
							target="_blank"
						>
							<GitHubIcon className="size-4" />
						</Link>
						<Link
							className="inline-flex min-h-11 min-w-8 items-center justify-center transition-colors hover:text-foreground"
							href="https://open.spotify.com/show/4JjPOmviFZEXMQwjXpxPtm"
							rel="noopener noreferrer"
							target="_blank"
							title="Creative Flux Podcast"
						>
							<SpotifyLogo className="size-5" />
						</Link>
						<Link
							aria-label="Jellypod on X"
							className="inline-flex min-h-11 min-w-8 items-center justify-center transition-colors hover:text-foreground"
							href="https://twitter.com/JellypodAI"
							rel="noopener noreferrer"
							target="_blank"
						>
							<XLogo className="size-4" />
						</Link>
						<Link
							aria-label="Jellypod on LinkedIn"
							className="inline-flex min-h-11 min-w-8 items-center justify-center transition-colors hover:text-foreground"
							href="https://www.linkedin.com/company/jellypod"
							rel="noopener noreferrer"
							target="_blank"
						>
							<LinkedinLogo className="size-5" />
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
