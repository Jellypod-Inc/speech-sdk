import Link from "next/link";

export function GeminiBanner() {
	return (
		<div className="w-full border-border border-b bg-foreground py-2 text-center text-background text-xs sm:text-sm">
			Day 0 support for Google{" "}
			<span className="font-medium">Gemini 3.1 Flash TTS</span>{" "}
			<Link
				className="font-medium underline underline-offset-2"
				href="/playground?model=google%2Fgemini-3.1-flash-tts-preview"
			>
				Try it now →
			</Link>
		</div>
	);
}
