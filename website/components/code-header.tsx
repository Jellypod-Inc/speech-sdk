import { cn } from "@/shared/ui/lib/utils";

export function CodeHeader({
	lang = "TypeScript",
	className,
}: {
	lang?: string;
	className?: string;
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-2 border border-border border-b-0 bg-muted/70 px-3 py-1.5",
				className,
			)}
		>
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
			<span className="font-mono text-[11px] text-muted-foreground uppercase tracking-wide">
				{lang}
			</span>
		</div>
	);
}
