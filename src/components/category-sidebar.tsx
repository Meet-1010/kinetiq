"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type Cat = { slug: string; name: string; count: number };

export function CategorySidebar({ categories, total }: { categories: Cat[]; total: number }) {
  const pathname = usePathname();
  const active = pathname.startsWith("/library/") ? pathname.split("/")[2] : "all";
  const items = [{ slug: "all", name: "All Components", count: total }, ...categories];
  const chips = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chips.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [active]);

  return (
    <>
      {/* Desktop: the stacked glass pill rail */}
      <aside className="glass sticky top-24 hidden max-h-[calc(100dvh-7.5rem)] rounded-[32px] p-3 lg:block">
        <nav aria-label="Categories" className="scrollbar-thin flex max-h-[calc(100dvh-9rem)] flex-col gap-2.5 overflow-y-auto p-1">
          {items.map((c) => {
            const on = c.slug === active;
            return (
              <Link
                key={c.slug}
                href={c.slug === "all" ? "/library" : `/library/${c.slug}`}
                aria-current={on ? "page" : undefined}
                className={`group relative flex h-[52px] shrink-0 items-center justify-center rounded-[18px] px-4 text-[15.5px] transition-all duration-300 ${
                  on
                    ? "bg-gradient-to-r from-accent-deep via-accent to-accent-2 font-semibold text-accent-ink shadow-[0_0_28px_-6px_rgba(255,107,53,0.7),inset_0_1px_0_rgba(255,255,255,0.5)]"
                    : "border border-line bg-surface-solid/60 text-text-2 shadow-[inset_0_1px_0_rgba(255,228,210,0.05)] hover:border-line-strong hover:bg-surface-2 hover:text-text"
                }`}
              >
                <span>{c.name}</span>
                <span
                  className={`absolute right-3.5 font-mono text-[11px] tabular-nums transition-opacity ${
                    on ? "text-accent-ink/70" : "text-faint opacity-0 group-hover:opacity-100"
                  }`}
                >
                  {c.count}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {/* Mobile / tablet: horizontally scrolling chips */}
      <div ref={chips} className="scrollbar-thin -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
        {items.map((c) => {
          const on = c.slug === active;
          return (
            <Link
              key={c.slug}
              href={c.slug === "all" ? "/library" : `/library/${c.slug}`}
              aria-current={on ? "page" : undefined}
              className={`flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-[14px] ${on ? "accent-fill font-semibold" : "pill text-text-2"}`}
            >
              {c.name} <span className={`font-mono text-[11px] ${on ? "opacity-70" : "text-faint"}`}>{c.count}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
