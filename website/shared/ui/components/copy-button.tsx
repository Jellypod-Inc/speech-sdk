"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/shared/ui/lib/utils";

export function CopyButton({
	value,
	className,
	message = "Copied to clipboard",
}: {
	value: string;
	className?: string;
	message?: string;
}) {
	const [copied, setCopied] = useState(false);

	function handleCopy() {
		navigator.clipboard.writeText(value);
		setCopied(true);
		toast.success(message);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<button
			aria-label="Copy to clipboard"
			className={cn(
				"shrink-0 cursor-pointer text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none",
				className,
			)}
			onClick={handleCopy}
			type="button"
		>
			{copied ? (
				<Check className="text-primary" size={16} weight="bold" />
			) : (
				<Copy size={16} weight="regular" />
			)}
		</button>
	);
}
