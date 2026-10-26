import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { Footer } from "@/components/footer";
import { Nav } from "@/components/nav";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

export default function Layout({ children }: { children: React.ReactNode }) {
	const tree = source.getPageTree();

	return (
		<>
			<Nav tree={tree} />
			<DocsLayout tree={tree} {...baseOptions()}>
				{children}
			</DocsLayout>
			<Footer />
		</>
	);
}
