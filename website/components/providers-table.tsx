import Link from "next/link";
import { providerRegistry } from "@/data/index";
import { Badge } from "@/shared/ui/components/badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/ui/components/table";
import { latestModel } from "../lib/latest-model";

const providers = providerRegistry.flatMap(({ factory, prefix, name }) => {
	const { provider } = factory()();
	const model = latestModel(provider.models);
	return model
		? [
				{
					provider: name,
					model: `${prefix}/${model.id}`,
					isDefault: provider.defaultModel === model.id,
				},
			]
		: [];
});

export function ProvidersTable() {
	return (
		<section className="border-border border-t">
			<div className="mx-auto max-w-5xl px-4 py-14 sm:px-6 md:py-20">
				<div className="flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-end">
					<div>
						<p className="font-mono text-muted-foreground text-xs uppercase tracking-widest">
							PROVIDERS
						</p>
						<h2 className="mt-3 font-semibold text-3xl tracking-tight">
							Every provider, one interface
						</h2>
					</div>
					<Link
						className="inline-flex shrink-0 items-center justify-center whitespace-nowrap border border-border bg-background px-2.5 py-1 font-medium text-xs transition-all hover:bg-muted hover:text-foreground"
						href="/models"
					>
						View All Providers →
					</Link>
				</div>

				<div className="mt-8 min-w-0 overflow-x-auto border border-border">
					<Table>
						<TableHeader className="bg-stone-100 dark:bg-stone-900">
							<TableRow>
								<TableHead className="font-mono text-xs uppercase tracking-wider">
									Provider
								</TableHead>
								<TableHead className="font-mono text-xs uppercase tracking-wider">
									Newest model
								</TableHead>
								<TableHead className="font-mono text-xs uppercase tracking-wider">
									Default*
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{providers.map((row) => (
								<TableRow key={row.model}>
									<TableCell>{row.provider}</TableCell>
									<TableCell className="whitespace-nowrap font-mono text-xs sm:text-sm">
										{row.model}
									</TableCell>
									<TableCell>
										{row.isDefault ? (
											<Badge variant="secondary">Yes</Badge>
										) : (
											<span className="text-muted-foreground">-</span>
										)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				</div>

				<p className="mt-4 text-muted-foreground text-xs italic">
					* SDK defaults may differ from the newest model. Pass the provider
					name to use its default, e.g. model: &apos;openai&apos; resolves to
					openai/gpt-4o-mini-tts.
				</p>
			</div>
		</section>
	);
}
