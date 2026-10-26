"use client";

import Image from "next/image";
import Link from "next/link";
import { type ReactNode, useState } from "react";
import { InstallCommand } from "@/shared/blocks/components/install-command";
import { Toggle } from "@/shared/ui/components/toggle";
import { cn } from "@/shared/ui/lib/utils";
import type { Provider, ProviderMeta } from "./hero-data";

type Audience = "humans" | "agents";

export function Hero({
	codeBlocks,
	downloadsBadge,
	providers,
	extraProviderCount,
}: {
	codeBlocks: Record<Provider, ReactNode>;
	downloadsBadge: ReactNode;
	providers: ProviderMeta[];
	extraProviderCount: number;
}) {
	const [audience, setAudience] = useState<Audience>("humans");
	const [provider, setProvider] = useState<Provider>("openai");

	return (
		<section className="w-full py-12 sm:py-20 md:py-24">
			<div className="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-8 px-4">
				{/* Audience toggle */}
				<div className="flex flex-wrap items-center justify-between gap-3">
					<div className="inline-flex border border-border">
						<Toggle
							className={cn(
								"px-4 py-1.5 font-semibold text-sm",
								audience !== "humans" && "text-muted-foreground",
							)}
							onPressedChange={() => setAudience("humans")}
							pressed={audience === "humans"}
						>
							For humans
						</Toggle>
						<Toggle
							className={cn(
								"border-border border-l px-4 py-1.5 font-medium text-sm",
								audience !== "agents" && "text-muted-foreground",
							)}
							onPressedChange={() => setAudience("agents")}
							pressed={audience === "agents"}
						>
							For agents
						</Toggle>
					</div>
					{downloadsBadge}
				</div>

				{/* Heading */}
				<div className="flex flex-col gap-3">
					<h1 className="text-balance font-semibold text-4xl leading-tight tracking-tight md:text-5xl">
						The Unified Text-to-Speech SDK
					</h1>
					<p className="text-pretty text-lg text-muted-foreground">
						The SpeechSDK is a free, open-source toolkit for building better AI
						audio applications with multiple voice providers.
					</p>
				</div>

				<div className="flex min-w-0 flex-col gap-6">
					{/* Install command */}
					<InstallCommand
						command={
							audience === "humans"
								? "npm install @speech-sdk/core"
								: "npx skills add Jellypod-Inc/speech-sdk --skill speech-sdk"
						}
					/>

					{audience === "agents" && (
						<p className="text-muted-foreground text-sm leading-relaxed">
							Give your AI coding assistant full knowledge of this library.
							Works with Claude Code, Cursor, Codex, and more.
						</p>
					)}

					{/* Provider switcher */}
					<div className="flex flex-col gap-0 overflow-hidden">
						<fieldset
							aria-label="Speech provider"
							className="grid grid-cols-2 border border-border font-mono sm:flex sm:overflow-x-auto"
						>
							{providers.map((p, i) => (
								<Toggle
									className={cn(
										"flex min-h-10 min-w-0 flex-1 justify-center whitespace-nowrap border-border px-3 py-2 text-xs",
										i > 1 && "max-sm:border-t",
										i % 2 === 1 && "max-sm:border-l",
										i > 0 && "sm:border-l",
									)}
									key={p.id}
									onPressedChange={() => setProvider(p.id)}
									pressed={provider === p.id}
									variant="bold"
								>
									<span className="inline-flex items-center gap-1.5">
										<Image
											alt=""
											className={cn("size-3.5", p.iconInvert)}
											height={14}
											src={p.icon}
											width={14}
										/>
										{p.label}
									</span>
								</Toggle>
							))}
							<Link
								className="col-span-2 flex min-h-10 min-w-fit flex-1 items-center justify-center whitespace-nowrap border-border px-3 py-2 text-muted-foreground text-xs transition-colors hover:text-foreground max-sm:border-t sm:border-l"
								href="/models"
							>
								+{extraProviderCount} more →
							</Link>
						</fieldset>

						{/* Code blocks — all pre-rendered, toggled via CSS */}
						{providers.map((p) => (
							<div
								className={cn(
									"min-w-0 overflow-x-auto",
									provider !== p.id && "hidden",
								)}
								key={p.id}
							>
								{codeBlocks[p.id]}
							</div>
						))}
					</div>

					<div className="flex items-center justify-center gap-3 text-muted-foreground text-sm">
						<Link
							className="transition-colors hover:text-foreground"
							href="https://discord.com/invite/9FYgzU8JNk"
							rel="noopener"
							target="_blank"
						>
							Join our Discord
						</Link>
						<span aria-hidden="true" className="text-muted-foreground/60">
							•
						</span>
						<Link
							className="transition-colors hover:text-foreground"
							href="/models"
						>
							View all models →
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
