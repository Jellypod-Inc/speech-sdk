import Image from "next/image";
import { providerRegistry } from "@/data/index";
import { InstallCommand } from "@/shared/blocks/components/install-command";
import { WhySpeechSdkSection } from "@/shared/blocks/components/why-speech-sdk-section";
import {
	type ProviderLogoKey,
	providerLogoInvertClass,
	providerLogos,
} from "@/shared/ui/assets/providers";
import { cn } from "@/shared/ui/lib/utils";
import { providers as heroProviders } from "./hero-data";

const providers: { name: string; logo: ProviderLogoKey }[] = [
	{ name: "OpenAI", logo: "openai" },
	{ name: "ElevenLabs", logo: "elevenlabs" },
	{ name: "Google", logo: "google" },
	{ name: "xAI", logo: "xai" },
];

const additionalProviders = Math.max(
	0,
	providerRegistry.length - providers.length,
);

export function Toolkit() {
	return (
		<section className="border-border border-t">
			<div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 md:py-20">
				<WhySpeechSdkSection
					code={`import { generateConversation } from "@speech-sdk/core";

const result = await generateConversation({
  turns: [
    {
      model: "elevenlabs/${heroProviders.find((provider) => provider.id === "elevenlabs")?.modelId}",
      voice: "EXAVITQu4vr4xnSDxMaL",
      text: "Hello from the SDK.",
    },
    {
      model: "google/${heroProviders.find((provider) => provider.id === "google")?.modelId}",
      voice: "Kore",
      text: "One call. Multiple voices.",
    },
  ],
});

result.audio.uint8Array; // Uint8Array
result.audio.mediaType; // string`}
				>
					<div className="flex flex-col justify-between">
						<div>
							<h2 className="font-semibold text-2xl tracking-tight">
								Why SpeechSDK?
							</h2>
							<p className="mt-3 text-muted-foreground text-sm leading-relaxed">
								Locking into a single TTS provider&apos;s SDK means rewriting
								code when a better or less expensive model ships.
							</p>
							<p className="mt-2 text-muted-foreground text-sm leading-relaxed">
								The SpeechSDK integrates all major providers into an
								easy-to-use, unified interface so you can swap models without
								breaking your application code.
							</p>
							<InstallCommand
								className="mt-4"
								command="npm i @speech-sdk/core"
							/>
						</div>

						<div className="mt-8">
							<p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
								Supports
							</p>
							<div className="mt-3 flex flex-wrap items-center gap-2">
								{providers.map((p) => (
									<div
										className="flex size-9 items-center justify-center border border-border bg-muted/50"
										key={p.name}
										title={p.name}
									>
										<Image
											alt={p.name}
											className={cn("size-5", providerLogoInvertClass(p.logo))}
											height={20}
											src={providerLogos[p.logo]}
											width={20}
										/>
									</div>
								))}
								<span className="ml-1 text-muted-foreground text-sm">
									+ {additionalProviders} providers
								</span>
							</div>
						</div>
					</div>
				</WhySpeechSdkSection>
			</div>
		</section>
	);
}
