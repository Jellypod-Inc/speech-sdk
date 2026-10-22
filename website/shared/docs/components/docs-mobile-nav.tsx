"use client";

import { ArrowUpRight, List, X } from "@phosphor-icons/react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/components/sheet";
import Link from "fumadocs-core/link";
import type * as PageTree from "fumadocs-core/page-tree";
import { type ReactNode, useState } from "react";

export interface DocsNavLink {
  external?: boolean;
  href: string;
  label: string;
}

interface DocsMobileNavProps {
  actions?: ReactNode;
  links: DocsNavLink[];
  logo: ReactNode;
  tree?: PageTree.Root;
  triggerClassName?: string;
}

function folderKey(node: Extract<PageTree.Node, { type: "folder" }>): string {
  if (node.index) {
    return node.index.url;
  }
  return typeof node.name === "string" ? node.name : "folder";
}

function TreeNodes({
  nodes,
  onNavigate,
}: {
  nodes: PageTree.Node[];
  onNavigate: () => void;
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.type === "separator") {
          return (
            <p
              className="px-1 pt-4 pb-1 font-medium text-muted-foreground/70 text-xs uppercase tracking-wide"
              key={typeof node.name === "string" ? node.name : "separator"}
            >
              {node.name}
            </p>
          );
        }

        if (node.type === "folder") {
          return (
            <div className="flex flex-col" key={folderKey(node)}>
              {node.index ? (
                <Link
                  className="py-1.5 font-medium text-foreground text-sm transition-colors hover:text-primary"
                  href={node.index.url}
                  onClick={onNavigate}
                >
                  {node.name}
                </Link>
              ) : (
                <p className="py-1.5 font-medium text-foreground text-sm">
                  {node.name}
                </p>
              )}
              <div className="flex flex-col border-border border-l pl-3">
                <TreeNodes nodes={node.children} onNavigate={onNavigate} />
              </div>
            </div>
          );
        }

        return (
          <Link
            className="py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            href={node.url}
            key={node.url}
            onClick={onNavigate}
          >
            {node.name}
          </Link>
        );
      })}
    </>
  );
}

export function DocsMobileNav({
  links,
  logo,
  actions,
  tree,
  triggerClassName = "md:hidden",
}: DocsMobileNavProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Sheet onOpenChange={setOpen} open={open}>
      <SheetTrigger
        className={`inline-flex items-center justify-center p-1.5 text-muted-foreground transition-colors hover:text-foreground ${triggerClassName}`}
      >
        <List size={20} weight="bold" />
        <span className="sr-only">Open menu</span>
      </SheetTrigger>
      <SheetContent
        className="flex max-h-[90svh] flex-col overflow-y-auto p-6"
        showCloseButton={false}
        side="top"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex items-center justify-between border-border border-b pb-4">
          <Link
            className="transition-opacity hover:opacity-70"
            href="/"
            onClick={close}
          >
            {logo}
          </Link>
          <SheetClose className="inline-flex items-center justify-center p-1.5 text-muted-foreground transition-colors hover:text-foreground">
            <X size={20} weight="bold" />
            <span className="sr-only">Close menu</span>
          </SheetClose>
        </div>
        <nav className="flex flex-col gap-1 pt-4">
          {links.map((link) => (
            <Link
              className="inline-flex items-center gap-1 py-2 font-medium text-muted-foreground text-sm transition-colors hover:text-foreground"
              href={link.href}
              key={link.href}
              onClick={close}
            >
              {link.label}
              {link.external && <ArrowUpRight size={14} />}
            </Link>
          ))}
        </nav>
        {tree && tree.children.length > 0 && (
          <div className="mt-4 flex flex-col border-border border-t pt-4">
            <p className="pb-1 font-semibold text-foreground text-xs uppercase tracking-wide">
              Documentation
            </p>
            <TreeNodes nodes={tree.children} onNavigate={close} />
          </div>
        )}
        {actions && (
          <SheetClose
            render={
              <div className="mt-4 flex flex-col gap-2 border-border border-t pt-4" />
            }
          >
            {actions}
          </SheetClose>
        )}
      </SheetContent>
    </Sheet>
  );
}
