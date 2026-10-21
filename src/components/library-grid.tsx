"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo, useState } from "react";
import type { Component } from "@/lib/library";
import { ComponentCard } from "./component-card";
import { SearchButton } from "./header-controls";

export function LibraryGrid({ items, categoryNames }: { items: Component[]; categoryNames: Record<string, string> }) {
  const [tag, setTag] = useState<string | null>(null);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of items) for (const t of [...c.tags, ...(c.framework ? [c.framework] : [])]) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .filter(([, n]) => n >= 2 && n < items.length)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 9);
  }, [items]);

  const shown = tag ? items.filter((c) => c.tags.includes(tag) || c.framework === tag) : items;

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <div className="scrollbar-thin -mx-1 flex flex-1 gap-2 overflow-x-auto px-1 py-1">
          <button
            onClick={() => setTag(null)}
            className={`h-9 shrink-0 rounded-full px-4 text-[13px] transition ${tag === null ? "bg-white text-[#0a0f1a] font-semibold" : "pill text-text-2 hover:text-text"}`}
          >
            All · {items.length}
          </button>
          {tags.map(([t, n]) => (
            <button
              key={t}
              onClick={() => setTag(tag === t ? null : t)}
              className={`h-9 shrink-0 rounded-full px-4 text-[13px] transition ${tag === t ? "bg-white text-[#0a0f1a] font-semibold" : "pill text-text-2 hover:text-text"}`}
            >
              {t} <span className={`font-mono text-[11px] ${tag === t ? "text-black/50" : "text-faint"}`}>{n}</span>
            </button>
          ))}
        </div>
        <div className="hidden xl:block">
          <SearchButton wide />
        </div>
      </div>

      <motion.div layout className="grid grid-cols-1 gap-5 sm:gap-6 md:grid-cols-2 2xl:grid-cols-3">
        <AnimatePresence mode="popLayout">
          {shown.map((c, i) => (
            <motion.div
              key={c.id}
              layout
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.04, ease: [0.2, 0.8, 0.2, 1] }}
            >
              <ComponentCard c={c} categoryName={categoryNames[c.category]} eager={i < 4} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
