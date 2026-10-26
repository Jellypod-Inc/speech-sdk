import { createHighlighter } from "shiki";
import { cn } from "@/shared/ui/lib/utils";
import { CodeHeader } from "./code-header";

const highlighterPromise = createHighlighter({
	themes: ["github-light", "github-dark"],
	langs: ["typescript", "bash"],
});

export async function SyntaxHighlight({
	code,
	lang = "typescript",
	className,
	showHeader = true,
}: {
	code: string;
	lang?: "typescript" | "bash";
	className?: string;
	showHeader?: boolean;
}) {
	const highlighter = await highlighterPromise;
	const html = highlighter.codeToHtml(code, {
		lang,
		themes: { light: "github-light", dark: "github-dark" },
		defaultColor: false,
	});

	return (
		<div className="min-w-0 max-w-full">
			{showHeader && (
				<CodeHeader
					className={className}
					lang={lang === "bash" ? "Bash" : "TypeScript"}
				/>
			)}
			<div
				className={cn(
					"[&_pre]:!bg-muted/50 border border-border [&_code]:font-mono [&_pre]:overflow-x-auto [&_pre]:p-4 [&_pre]:text-sm",
					"[&_.shiki]:bg-[var(--shiki-light-bg)] [&_.shiki]:text-[var(--shiki-light)] [&_.shiki_span]:text-[var(--shiki-light)]",
					"dark:[&_.shiki]:bg-[var(--shiki-dark-bg)] dark:[&_.shiki]:text-[var(--shiki-dark)] dark:[&_.shiki_span]:text-[var(--shiki-dark)]",
					className,
				)}
				// biome-ignore lint/security/noDangerouslySetInnerHtml: Shiki generates trusted HTML
				dangerouslySetInnerHTML={{ __html: html }}
			/>
		</div>
	);
}
