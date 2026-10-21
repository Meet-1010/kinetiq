import type { Metadata } from "next";
import { LibraryGrid } from "@/components/library-grid";
import { LibraryHeader } from "@/components/library-header";
import { withLive } from "@/lib/demos";
import { categories, components, totalComponents } from "@/lib/library";

export const metadata: Metadata = { title: "Library" };

const names = Object.fromEntries(categories.map((c) => [c.slug, c.name]));

export default function LibraryPage() {
  return (
    <>
      <LibraryHeader
        eyebrow={`${categories.length} categories`}
        title="The whole library"
        blurb="Every component plays live. Hover to see the stack, open one for details and the full-size preview."
        count={totalComponents}
      />
      <LibraryGrid items={withLive(components)} categoryNames={names} />
    </>
  );
}
