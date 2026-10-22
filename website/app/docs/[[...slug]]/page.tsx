import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from "fumadocs-ui/layouts/docs/page";
import { createRelativeLink } from "fumadocs-ui/mdx";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LLMCopyButton } from "@/components/llm-copy-button";
import { getMDXComponents } from "@/components/mdx";
import { source } from "@/lib/source";

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  const MDX = page.data.body;
  const markdownUrl = `${page.url}.md`;

  return (
    <DocsPage full={page.data.full} toc={page.data.toc}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <div className="flex items-center border-b pb-4">
        <LLMCopyButton markdownUrl={markdownUrl} />
      </div>
      <DocsBody>
        <MDX
          components={getMDXComponents({
            a: createRelativeLink(source, page),
          })}
        />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}): Promise<Metadata> {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) {
    notFound();
  }

  const ogTitle = page.data.ogTitle ?? page.data.title;
  const ogParams = new URLSearchParams({ title: ogTitle });
  if (page.data.description) {
    ogParams.set("description", page.data.description);
  }

  return {
    title: page.data.title,
    description: page.data.description,
    openGraph: {
      images: [`/api/og?${ogParams.toString()}`],
    },
  };
}
