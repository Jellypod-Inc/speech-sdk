import type { ReactNode } from "react";
import { Faq } from "@/components/faq";
import { FeatureCards } from "@/components/feature-cards";
import { Footer } from "@/components/footer";
import { GatewayCallout } from "@/components/gateway-callout";
import { Hero } from "@/components/hero";
import {
	extraProviderCount,
	type Provider,
	providerCode,
	providers,
} from "@/components/hero-data";
import { Nav } from "@/components/nav";
import { NpmDownloads } from "@/components/npm-downloads";
import { ProvidersTable } from "@/components/providers-table";
import { StatsBar } from "@/components/stats-bar";
import { TechnicalDetails } from "@/components/technical-details";
import { Toolkit } from "@/components/toolkit";
import { SyntaxHighlight } from "@/shared/blocks/components/syntax-highlight";

export default async function Page() {
	const codeBlocks = Object.fromEntries(
		providers.map((p) => [
			p.id,
			<SyntaxHighlight
				code={providerCode[p.id]}
				key={p.id}
				lang="typescript"
			/>,
		]),
	) as Record<Provider, ReactNode>;

	return (
		<>
			<Nav />
			<main>
				<Hero
					codeBlocks={codeBlocks}
					downloadsBadge={<NpmDownloads />}
					extraProviderCount={extraProviderCount}
					providers={providers}
				/>
				<section className="mx-auto flex max-w-5xl flex-col gap-6 px-4 pb-12 sm:px-6 md:pb-20">
					<StatsBar />
					<FeatureCards />
				</section>
				<Toolkit />
				<TechnicalDetails />
				<ProvidersTable />
				<Faq />
				<GatewayCallout />
			</main>
			<Footer />
		</>
	);
}
