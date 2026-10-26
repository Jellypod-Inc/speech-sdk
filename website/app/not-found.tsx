import Link from "next/link";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";

export default function NotFound() {
	return (
		<>
			<Nav />
			<main className="flex flex-1 items-center justify-center px-6">
				<div className="flex flex-col items-center gap-8 py-32">
					{/* Error code */}
					<div className="flex items-baseline gap-4">
						<span className="font-mono font-semibold text-8xl text-foreground tracking-tighter md:text-9xl">
							404
						</span>
					</div>

					{/* Message */}
					<div className="flex max-w-md flex-col items-center gap-2 text-center">
						<p className="text-lg text-muted-foreground">
							This route doesn&apos;t match any provider in our registry.
						</p>
						<p className="font-mono text-muted-foreground/60 text-sm">
							ERR_ROUTE_NOT_FOUND
						</p>
					</div>

					{/* Code snippet */}
					<div className="w-full max-w-md border border-border bg-muted/50 font-mono text-sm">
						<div className="border-border border-b px-4 py-2 text-muted-foreground text-xs">
							terminal
						</div>
						<div className="space-y-1 px-4 py-3">
							<p>
								<span className="text-muted-foreground">$ </span>
								<span className="text-foreground">
									speechsdk resolve --path
								</span>
							</p>
							<p className="text-red-400">
								Error: no handler registered for this route
							</p>
							<p className="text-muted-foreground">
								Try `speechsdk list` to see available routes
							</p>
						</div>
					</div>

					{/* Actions */}
					<div className="flex items-center gap-3">
						<Link
							className="inline-flex items-center justify-center bg-primary px-4 py-2 font-medium text-primary-foreground text-sm transition-all hover:bg-primary/80"
							href="/"
						>
							Back to home
						</Link>
						<Link
							className="inline-flex items-center justify-center border border-border bg-background px-4 py-2 font-medium text-sm transition-all hover:bg-muted hover:text-foreground"
							href="/models"
						>
							View models
						</Link>
					</div>
				</div>
			</main>
			<Footer />
		</>
	);
}
