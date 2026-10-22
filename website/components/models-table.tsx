"use client";

import {
	CaretDown,
	CaretUp,
	Check,
	MagnifyingGlass,
} from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import { useMemo, useState } from "react";
import { type Model, models, providers } from "@/data/index";
import { Input } from "@/shared/ui/components/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/shared/ui/components/popover";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/ui/components/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/shared/ui/components/table";
import { cn } from "@/shared/ui/lib/utils";

type SortDirection = "asc" | "desc";
type SortColumn =
	| "provider"
	| "model"
	| "languages"
	| "releaseDate"
	| "openSource"
	| "streaming"
	| "audioTags"
	| "inlineVoiceCloning";

const MAX_VISIBLE_LANGUAGES = 3;
const MAX_VISIBLE_LANGUAGE_CHARS = 7;

function LanguageBadges({ languages }: { languages: string[] }) {
	const visible: string[] = [];
	let totalChars = 0;
	for (const lang of languages) {
		if (visible.length >= MAX_VISIBLE_LANGUAGES) {
			break;
		}
		if (
			totalChars + lang.length > MAX_VISIBLE_LANGUAGE_CHARS &&
			visible.length > 0
		) {
			break;
		}
		visible.push(lang);
		totalChars += lang.length;
	}
	const remaining = languages.slice(visible.length);

	return (
		<div className="flex flex-nowrap items-center gap-1">
			{visible.map((lang) => (
				<span
					className="whitespace-nowrap border border-border px-1.5 py-0.5 font-mono text-muted-foreground text-xs"
					key={lang}
				>
					{lang}
				</span>
			))}
			{remaining.length > 0 && (
				<Popover>
					<PopoverTrigger className="whitespace-nowrap border border-border px-1.5 py-0.5 font-mono text-muted-foreground text-xs transition-colors hover:bg-muted">
						+{remaining.length} more
					</PopoverTrigger>
					<PopoverContent align="start" className="w-auto max-w-xs">
						<div className="flex flex-wrap gap-1">
							{languages.map((lang) => (
								<span
									className="border border-border px-1.5 py-0.5 font-mono text-muted-foreground text-xs"
									key={lang}
								>
									{lang}
								</span>
							))}
						</div>
					</PopoverContent>
				</Popover>
			)}
		</div>
	);
}

function BooleanCell({ value }: { value: boolean }) {
	return value ? (
		<Check className="inline size-4 text-foreground" weight="bold" />
	) : (
		<span className="text-muted-foreground">—</span>
	);
}

function SortIcon({
	column,
	activeColumn,
	direction,
}: {
	column: SortColumn;
	activeColumn: SortColumn;
	direction: SortDirection;
}) {
	if (column !== activeColumn) {
		return <CaretDown className="size-3 text-muted-foreground/40" />;
	}
	return direction === "desc" ? (
		<CaretDown className="size-3" />
	) : (
		<CaretUp className="size-3" />
	);
}

function comparator(
	a: Model,
	b: Model,
	column: SortColumn,
	direction: SortDirection,
): number {
	let cmp = 0;
	switch (column) {
		case "provider":
			cmp = a.provider.localeCompare(b.provider);
			break;
		case "model":
			cmp = a.model.localeCompare(b.model);
			break;
		case "languages":
			cmp = a.languages.length - b.languages.length;
			break;
		case "releaseDate":
			cmp = (Date.parse(a.releaseDate) || 0) - (Date.parse(b.releaseDate) || 0);
			break;
		case "openSource":
			cmp = Number(a.openSource) - Number(b.openSource);
			break;
		case "streaming":
			cmp = Number(a.streaming) - Number(b.streaming);
			break;
		case "audioTags":
			cmp = Number(a.audioTags) - Number(b.audioTags);
			break;
		case "inlineVoiceCloning":
			cmp = Number(a.inlineVoiceCloning) - Number(b.inlineVoiceCloning);
			break;
		default:
			break;
	}
	return direction === "asc" ? cmp : -cmp;
}

function sortAria(
	column: SortColumn,
	active: SortColumn,
	direction: SortDirection,
): "none" | "ascending" | "descending" {
	if (column !== active) {
		return "none";
	}
	return direction === "asc" ? "ascending" : "descending";
}

export function ModelsTable() {
	const [search, setSearch] = useState("");
	const [providerFilter, setProviderFilter] = useState<string>("all");
	const [sortColumn, setSortColumn] = useState<SortColumn>("releaseDate");
	const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

	function handleSort(column: SortColumn) {
		if (sortColumn === column) {
			setSortDirection((d) => (d === "desc" ? "asc" : "desc"));
		} else {
			setSortColumn(column);
			setSortDirection("desc");
		}
	}

	const filtered = useMemo(() => {
		let result: Model[] = [...models];

		if (providerFilter !== "all") {
			result = result.filter((m) => m.provider === providerFilter);
		}

		if (search) {
			const terms = search.toLowerCase().split(" ").filter(Boolean);
			result = result.filter((m) => {
				const haystack =
					`${m.provider} ${m.model} ${m.languages.join(" ")}`.toLowerCase();
				return terms.every((term) => haystack.includes(term));
			});
		}

		result.sort((a, b) => comparator(a, b, sortColumn, sortDirection));

		return result;
	}, [search, providerFilter, sortColumn, sortDirection]);

	const headClass =
		"font-mono text-xs tracking-wider uppercase cursor-pointer select-none hover:text-foreground transition-colors";

	return (
		<div className="flex flex-col gap-6">
			{/* Filters */}
			<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
				<div className="relative w-full sm:max-w-xs">
					<MagnifyingGlass className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
					<Input
						aria-label="Search models, providers, or languages"
						className="pl-8"
						onChange={(e) => setSearch(e.target.value)}
						placeholder="Search models, providers, languages..."
						value={search}
					/>
				</div>
				<div>
					<Select
						onValueChange={(v) => setProviderFilter(v ?? "all")}
						value={providerFilter}
					>
						<SelectTrigger className="h-8 w-full text-xs sm:w-[160px]">
							<SelectValue>
								{providerFilter === "all" ? "All providers" : providerFilter}
							</SelectValue>
						</SelectTrigger>
						<SelectContent>
							<SelectItem value="all">All providers</SelectItem>
							{providers.map((p) => (
								<SelectItem key={p} value={p}>
									{p}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
			</div>

			{/* Table */}
			<div className="overflow-x-auto border border-border">
				<Table>
					<TableHeader className="bg-stone-100 dark:bg-stone-900">
						<TableRow>
							<TableHead
								aria-sort={sortAria("provider", sortColumn, sortDirection)}
								className={headClass}
							>
								<button
									className="flex min-h-10 w-full items-center text-left"
									onClick={() => handleSort("provider")}
									type="button"
								>
									<span className="inline-flex items-center gap-1">
										Provider{" "}
										<SortIcon
											activeColumn={sortColumn}
											column="provider"
											direction={sortDirection}
										/>
									</span>
								</button>
							</TableHead>
							<TableHead
								aria-sort={sortAria("model", sortColumn, sortDirection)}
								className={headClass}
							>
								<button
									className="flex min-h-10 w-full items-center text-left"
									onClick={() => handleSort("model")}
									type="button"
								>
									<span className="inline-flex items-center gap-1">
										Model{" "}
										<SortIcon
											activeColumn={sortColumn}
											column="model"
											direction={sortDirection}
										/>
									</span>
								</button>
							</TableHead>
							<TableHead
								aria-sort={sortAria("languages", sortColumn, sortDirection)}
								className={`${headClass} min-w-[200px]`}
							>
								<button
									className="flex min-h-10 w-full items-center text-left"
									onClick={() => handleSort("languages")}
									type="button"
								>
									<span className="inline-flex items-center gap-1">
										Languages{" "}
										<SortIcon
											activeColumn={sortColumn}
											column="languages"
											direction={sortDirection}
										/>
									</span>
								</button>
							</TableHead>
							<TableHead
								aria-sort={sortAria("releaseDate", sortColumn, sortDirection)}
								className={headClass}
							>
								<button
									className="flex min-h-10 w-full items-center text-left"
									onClick={() => handleSort("releaseDate")}
									type="button"
								>
									<span className="inline-flex items-center gap-1">
										Release Date{" "}
										<SortIcon
											activeColumn={sortColumn}
											column="releaseDate"
											direction={sortDirection}
										/>
									</span>
								</button>
							</TableHead>
							<TableHead
								aria-sort={sortAria("openSource", sortColumn, sortDirection)}
								className={`${headClass} text-center`}
							>
								<button
									className="flex min-h-10 w-full items-center text-left"
									onClick={() => handleSort("openSource")}
									type="button"
								>
									<span className="inline-flex items-center justify-center gap-1">
										Open Source{" "}
										<SortIcon
											activeColumn={sortColumn}
											column="openSource"
											direction={sortDirection}
										/>
									</span>
								</button>
							</TableHead>
							<TableHead
								aria-sort={sortAria("streaming", sortColumn, sortDirection)}
								className={`${headClass} text-center`}
							>
								<button
									className="flex min-h-10 w-full items-center text-left"
									onClick={() => handleSort("streaming")}
									type="button"
								>
									<span className="inline-flex items-center justify-center gap-1">
										Streaming{" "}
										<SortIcon
											activeColumn={sortColumn}
											column="streaming"
											direction={sortDirection}
										/>
									</span>
								</button>
							</TableHead>
							<TableHead
								aria-sort={sortAria("audioTags", sortColumn, sortDirection)}
								className={`${headClass} text-center`}
							>
								<button
									className="flex min-h-10 w-full items-center text-left"
									onClick={() => handleSort("audioTags")}
									type="button"
								>
									<span className="inline-flex items-center justify-center gap-1">
										Audio Tags{" "}
										<SortIcon
											activeColumn={sortColumn}
											column="audioTags"
											direction={sortDirection}
										/>
									</span>
								</button>
							</TableHead>
							<TableHead
								aria-sort={sortAria(
									"inlineVoiceCloning",
									sortColumn,
									sortDirection,
								)}
								className={`${headClass} text-center`}
							>
								<button
									className="flex min-h-10 w-full items-center text-left"
									onClick={() => handleSort("inlineVoiceCloning")}
									type="button"
								>
									<span className="inline-flex items-center justify-center gap-1">
										Voice Clone*{" "}
										<SortIcon
											activeColumn={sortColumn}
											column="inlineVoiceCloning"
											direction={sortDirection}
										/>
									</span>
								</button>
							</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{filtered.map((row) => (
							<TableRow key={row.model}>
								<TableCell>
									<div className="flex items-center gap-2">
										<Image
											alt=""
											className={cn("size-4 shrink-0", row.providerIconInvert)}
											height={16}
											src={row.providerIcon}
											unoptimized
											width={16}
										/>
										<span className="text-sm">{row.provider}</span>
									</div>
								</TableCell>
								<TableCell className="font-mono text-sm">{row.model}</TableCell>
								<TableCell>
									<LanguageBadges languages={row.languages} />
								</TableCell>
								<TableCell className="whitespace-nowrap text-muted-foreground text-sm">
									{row.releaseDate
										? new Date(
												`${row.releaseDate}T00:00:00`,
											).toLocaleDateString("en-US", {
												year: "numeric",
												month: "short",
												day: "numeric",
											})
										: "Not documented"}
								</TableCell>
								<TableCell className="text-center">
									<BooleanCell value={row.openSource} />
								</TableCell>
								<TableCell className="text-center">
									<BooleanCell value={row.streaming} />
								</TableCell>
								<TableCell className="text-center">
									<BooleanCell value={row.audioTags} />
								</TableCell>
								<TableCell className="text-center">
									<BooleanCell value={row.inlineVoiceCloning} />
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>

			<div className="flex flex-col gap-1">
				<p className="text-muted-foreground text-xs italic">
					Audio Tags — bracket syntax like [laughs], [sighs], or [whispers] that
					adds expressive audio cues to generated speech. Models without support
					will strip tags and return warnings.
				</p>
				<p className="text-muted-foreground text-xs italic">
					*Voice Clone refers to passing inline audio references instead of
					selecting a pre-defined voice.
				</p>
			</div>
		</div>
	);
}
