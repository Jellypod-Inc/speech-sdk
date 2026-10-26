import Link from "next/link";
import { SpeechSDKLogo } from "@/components/speech-sdk-logo";

export function GatewayCallout() {
	return (
		<section>
			<div className="mx-auto max-w-5xl px-6 pb-24">
				<div className="flex flex-col items-center gap-6 border border-border p-12 text-center">
					<SpeechSDKLogo className="text-2xl" />
					<p className="text-muted-foreground">
						One SDK, every provider. Add text-to-speech to your app in minutes
						with a unified, open-source interface.
					</p>
					<div className="flex w-full flex-col items-center justify-center gap-4 sm:w-auto sm:flex-row">
						<Link
							className="inline-flex w-full items-center justify-center border border-foreground bg-foreground px-4 py-2 font-medium text-background text-sm transition-colors hover:bg-foreground/90 sm:w-auto"
							href="https://github.com/Jellypod-Inc/speech-sdk"
							target="_blank"
						>
							Get started →
						</Link>
						<Link
							className="inline-flex w-full items-center justify-center border border-border px-4 py-2 font-medium text-sm transition-colors hover:bg-muted sm:w-auto"
							href="/models"
						>
							View models
						</Link>
					</div>
				</div>
			</div>
		</section>
	);
}
