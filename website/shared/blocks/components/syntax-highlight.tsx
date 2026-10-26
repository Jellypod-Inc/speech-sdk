import { cache } from "react";
import { createHighlighter, type Highlighter } from "shiki";
import { cn } from "@/shared/ui/lib/utils";

const SUPPORTED_LANGS = ["typescript", "bash"] as const;
type Lang = (typeof SUPPORTED_LANGS)[number];

const LANG_LABELS: Record<Lang, string> = {
	typescript: "TypeScript",
	bash: "Bash",
};

let highlighterPromise: Promise<Highlighter> | null = null;
function getHighlighter() {
	highlighterPromise ??= createHighlighter({
		themes: ["github-light", "github-dark"],
		langs: [...SUPPORTED_LANGS],
	});
	return highlighterPromise;
}

const renderHtml = cache(async (code: string, lang: Lang) => {
	const highlighter = await getHighlighter();
	return highlighter.codeToHtml(code, {
		lang,
		themes: { light: "github-light", dark: "github-dark" },
		defaultColor: false,
	});
});

interface SyntaxHighlightProps {
	className?: string;
	code: string;
	/** Render a terminal-style header with traffic-light dots and the given filename. */
	filename?: string;
	lang?: Lang;
	/** Render a language badge header (icon + lang name). Ignored when `filename` is set. */
	langBadge?: boolean;
}

export async function SyntaxHighlight({
	className,
	code,
	filename,
	lang = "typescript",
	langBadge = false,
}: SyntaxHighlightProps) {
	const html = await renderHtml(code, lang);

	let header: React.ReactNode = null;
	if (filename) {
		header = <TerminalHeader filename={filename} />;
	} else if (langBadge) {
		header = <LangBadgeHeader lang={lang} />;
	}

	return (
		<div className={cn("border border-border", className)}>
			{header}
			<div
				className={cn(
					"[&_pre]:!bg-muted/50 [&_code]:font-mono [&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:text-sm [&_pre]:leading-relaxed",
					"[&_.shiki]:bg-[var(--shiki-light-bg)] [&_.shiki]:text-[var(--shiki-light)] [&_.shiki_span]:text-[var(--shiki-light)]",
					"dark:[&_.shiki]:bg-[var(--shiki-dark-bg)] dark:[&_.shiki]:text-[var(--shiki-dark)] dark:[&_.shiki_span]:text-[var(--shiki-dark)]",
				)}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki generates trusted HTML
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	);
}

function TerminalHeader({ filename }: { filename: string }) {
	return (
		<div className="flex items-center justify-between border-border border-b bg-muted/40 px-4 py-2">
			<div className="flex items-center gap-1.5">
				<span aria-hidden="true" className="size-2.5 rounded-full bg-red-400" />
				<span
					aria-hidden="true"
					className="size-2.5 rounded-full bg-yellow-400"
				/>
				<span
					aria-hidden="true"
					className="size-2.5 rounded-full bg-green-400"
				/>
			</div>
			<span className="font-mono text-muted-foreground text-xs">
				{filename}
			</span>
		</div>
	);
}

function LangBadgeHeader({ lang }: { lang: Lang }) {
	return (
		<div className="flex items-center gap-2 border-border border-b bg-muted/70 px-3 py-1.5">
			{lang === "typescript" ? <TypeScriptIcon /> : null}
			<span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
				{LANG_LABELS[lang]}
			</span>
		</div>
	);
}

function TypeScriptIcon() {
	return (
		<svg
			aria-hidden="true"
			className="size-3.5"
			viewBox="0 0 16 16"
			xmlns="http://www.w3.org/2000/svg"
		>
			<title>TypeScript</title>
			<rect fill="#3178C6" height="16" width="16" />
			<text
				fill="#fff"
				fontFamily="ui-sans-serif, system-ui, sans-serif"
				fontSize="7"
				fontWeight="700"
				textAnchor="middle"
				x="8"
				y="11.5"
			>
				TS
			</text>
		</svg>
	);
}
