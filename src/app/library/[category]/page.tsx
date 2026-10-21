import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LibraryGrid } from "@/components/library-grid";
import { GridSkeleton } from "@/components/skeletons";
import { LibraryHeader } from "@/components/library-header";
import { withLive } from "@/lib/demos";
import { categories, componentsIn, getCategory } from "@/lib/library";

const names = Object.fromEntries(categories.map((c) => [c.slug, c.name]));

export function generateStaticParams() {
  return categories.map((c) => ({ category: c.slug }));
}

export async function generateMetadata({ params }: PageProps<"/library/[category]">): Promise<Metadata> {
  const cat = getCategory((await params).category);
  return cat ? { title: cat.name, description: cat.blurb } : {};
}

export default function CategoryPage({ params }: PageProps<"/library/[category]">) {
  return (
    <Suspense fallback={<GridSkeleton />}>
      <Category params={params} />
    </Suspense>
  );
}

async function Category({ params }: { params: PageProps<"/library/[category]">["params"] }) {
  const cat = getCategory((await params).category);
  if (!cat) notFound();
  return (
    <>
      <LibraryHeader eyebrow="Category" title={cat.name} blurb={cat.blurb} count={cat.count} />
      <LibraryGrid items={withLive(componentsIn(cat.slug))} categoryNames={names} />
    </>
  );
}
