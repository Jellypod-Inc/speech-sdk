import { models, providers } from "@/data/index";
import { cn } from "@/shared/ui/lib/utils";

export function StatsBar() {
	const modelCount = models.length;
	const stats = [
		{ label: "Providers", value: `${providers.length}` },
		{ label: "Models", value: `${modelCount}` },
		{ label: "For Production", value: "Built" },
		{ label: "Apache 2.0 License", value: "Open Source" },
	];

	return (
		<div className="grid grid-cols-2 border border-border md:grid-cols-4">
			{stats.map((stat, i) => (
				<div
					className={cn(
						"p-6 text-center",
						i < stats.length - 1 && "border-border border-r",
						i < 2 && "max-md:border-border max-md:border-b",
						i === 1 && "max-md:border-r-0",
						i === 2 && "max-md:border-r",
					)}
					key={stat.label}
				>
					<div className="font-semibold text-lg sm:text-2xl">{stat.value}</div>
					<div className="mt-1 font-mono text-muted-foreground text-xs uppercase tracking-widest">
						{stat.label}
					</div>
				</div>
			))}
		</div>
	);
}
