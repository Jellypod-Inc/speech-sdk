import {
	defineConfig,
	defineDocs,
	frontmatterSchema,
} from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
	dir: "content/docs",
	docs: {
		schema: frontmatterSchema.extend({
			ogTitle: z.string().optional(),
		}),
		postprocess: {
			includeProcessedMarkdown: true,
		},
	},
});

export default defineConfig();
