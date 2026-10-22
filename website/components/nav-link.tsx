"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/shared/ui/lib/utils";

export function NavLink({
	href,
	children,
	className,
}: {
	href: string;
	children: React.ReactNode;
	className?: string;
}) {
	const pathname = usePathname();
	const isActive =
		pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

	return (
		<Link
			className={cn(
				"text-sm transition-colors hover:text-foreground",
				isActive
					? "text-foreground underline underline-offset-4"
					: "text-muted-foreground",
				className,
			)}
			href={href}
		>
			{children}
		</Link>
	);
}
