"use client";

import { Check, Copy } from "@phosphor-icons/react";
import { useState } from "react";
import { toast } from "sonner";

export function LLMCopyButton({ markdownUrl }: { markdownUrl: string }) {
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		try {
			const res = await fetch(markdownUrl);
			if (!res.ok) {
				throw new Error(`Failed to fetch: ${res.status}`);
			}
			const text = await res.text();
			await navigator.clipboard.writeText(text);
			setCopied(true);
			toast.success("Copied markdown to clipboard");
			setTimeout(() => setCopied(false), 2000);
		} catch {
			toast.error("Failed to copy to clipboard");
		}
	}

	return (
		<button
			className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground"
			onClick={handleCopy}
			type="button"
		>
			{copied ? <Check size={14} /> : <Copy size={14} />}
			Copy as Markdown
		</button>
	);
}
