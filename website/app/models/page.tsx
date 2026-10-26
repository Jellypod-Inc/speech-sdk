import { Footer } from "@/components/footer";
import { ModelsTable } from "@/components/models-table";
import { Nav } from "@/components/nav";
import { models } from "@/data/index";

export const metadata = {
	title: "Models | SpeechSDK",
	description:
		"Every text-to-speech model supported by SpeechSDK. Compare providers, languages, and capabilities.",
	openGraph: {
		images: ["/api/og?title=Speech+Models+and+Providers"],
	},
};

export default function ModelsPage() {
	return (
		<>
			<Nav />
			<main>
				<section className="mx-auto min-w-0 max-w-7xl px-4 py-12 sm:px-6 md:py-20">
					<p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
						MODELS & PROVIDERS
					</p>
					<h1 className="mt-3 font-semibold text-3xl tracking-tight">
						Supporting {models.length} speech models
					</h1>
					<p className="mt-3 text-muted-foreground">
						All the text-to-speech models supported by SpeechSDK in one place.
					</p>

					<div className="mt-10">
						<ModelsTable />
					</div>
				</section>
			</main>
			<Footer />
		</>
	);
}
