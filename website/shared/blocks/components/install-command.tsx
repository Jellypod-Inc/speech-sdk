import { CopyButton } from "@/shared/ui/components/copy-button";
import { cn } from "@/shared/ui/lib/utils";

interface InstallCommandProps {
	className?: string;
	command: string;
}

export function InstallCommand({ className, command }: InstallCommandProps) {
	return (
		<div
			className={cn(
				"flex items-center justify-between border border-border bg-muted/50 px-4 py-3 font-mono text-sm",
				className,
			)}
		>
			<span>
				<span className="text-muted-foreground">$ </span>
				<span className="text-foreground">{command}</span>
			</span>
			<CopyButton className="ml-4" value={command} />
		</div>
	);
}
