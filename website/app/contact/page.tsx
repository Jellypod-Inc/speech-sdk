import Link from "next/link";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";

export const metadata = {
	title: "Contact | SpeechSDK",
	description: "Get in touch with the Jellypod team.",
	openGraph: {
		images: ["/api/og?title=Contact+Us"],
	},
};

export default function ContactPage() {
	return (
		<>
			<Nav />
			<main>
				<section className="mx-auto max-w-5xl px-6 py-24">
					<div className="grid gap-px border border-border bg-border md:grid-cols-2">
						<div className="flex flex-col gap-4 bg-background p-8">
							<h1 className="font-semibold text-2xl tracking-tight">
								Contact Us
							</h1>
							<p className="text-muted-foreground text-sm leading-relaxed">
								Jellypod builds developer tools for generative media. The
								SpeechSDK is our open-source, multi-provider toolkit that makes
								it easy to add text-to-speech to any application.
							</p>
							<p className="text-muted-foreground text-sm leading-relaxed">
								Jellypod also builds an AI podcast studio used by thousands of
								creators, powered by the same speech infrastructure behind
								SpeechSDK. Whether you have questions about the SDK, need help
								with integration, or want to discuss enterprise needs, we&apos;d
								love to hear from you.
							</p>
						</div>

						<div className="flex flex-col justify-center gap-2 bg-background p-8">
							<p className="text-muted-foreground text-sm">Get in touch</p>
							<Link
								className="font-semibold text-lg transition-colors hover:text-muted-foreground"
								href="mailto:contact@jellypod.com"
							>
								contact@jellypod.com
							</Link>
						</div>
					</div>
				</section>
			</main>
			<Footer />
		</>
	);
}
