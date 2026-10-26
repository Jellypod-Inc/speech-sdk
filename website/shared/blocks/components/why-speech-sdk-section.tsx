import type { ReactNode } from "react";
import { generateConversationExample } from "../examples/generate-conversation";
import { SyntaxHighlight } from "./syntax-highlight";

interface WhySpeechSdkSectionProps {
	/** Left column content — heading, description, install command, and any tail (CTAs, provider logos, etc.). */
	children: ReactNode;
	code?: string;
}

export function WhySpeechSdkSection({
	children,
	code = generateConversationExample,
}: WhySpeechSdkSectionProps) {
	return (
		<div className="grid gap-12 overflow-hidden md:grid-cols-[1fr_1.5fr]">
			{children}
			<SyntaxHighlight
				className="min-w-0 overflow-hidden"
				code={code}
				filename="generate-conversation.ts"
				lang="typescript"
			/>
		</div>
	);
}
