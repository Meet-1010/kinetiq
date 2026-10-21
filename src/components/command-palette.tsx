"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, CornerDownLeft, Layers, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { posterSrc } from "@/lib/library";

export type PaletteItem = { id: string; title: string; category: string; categoryName: string; tags: string[] };
export type PaletteCategory = { slug: string; name: string; count: number };

const PaletteContext = createContext<() => void>(() => {});
export const useOpenPalette = () => useContext(PaletteContext);

function score(q: string, item: PaletteItem) {
  const hay = `${item.title} ${item.categoryName} ${item.tags.join(" ")} ${item.id}`.toLowerCase();
  let total = 0;
  for (const word of q.toLowerCase().split(/\s+/).filter(Boolean)) {
    if (item.title.toLowerCase().startsWith(word)) total += 6;
    else if (item.title.toLowerCase().includes(word)) total += 4;
    else if (hay.includes(word)) total += 2;
    else return 0;
  }
  return total;
}

export function CommandPaletteProvider({
  items,
  categories,
  children,
}: {
  items: PaletteItem[];
  categories: PaletteCategory[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  const openPalette = useCallback(() => {
    setQ("");
    setActive(0);
    setOpen(true);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      } else if (e.key === "/" && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, openPalette]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  const results = useMemo(() => {
    if (!q.trim()) return { cats: categories, comps: items.slice(0, 0) };
    const comps = items
      .map((it) => ({ it, s: score(q, it) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((x) => x.it);
    const cats = categories.filter((c) => c.name.toLowerCase().includes(q.toLowerCase().trim()));
    return { cats, comps };
  }, [q, items, categories]);

  const flat = useMemo(
    () => [
      ...results.cats.map((c) => ({ kind: "cat" as const, href: `/library/${c.slug}`, key: `cat-${c.slug}` })),
      ...results.comps.map((c) => ({ kind: "comp" as const, href: `/c/${c.id}`, key: c.id })),
    ],
    [results],
  );

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") setOpen(false);
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && flat[active]) go(flat[active].href);
  };

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  let index = -1;
  return (
    <PaletteContext.Provider value={openPalette}>
      {children}
      <AnimatePresence>
        {open && (
          <motion.div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <button aria-label="Close search" className="absolute inset-0 bg-[#02050c]/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="Search components"
              initial={{ y: -10, scale: 0.98 }}
              animate={{ y: 0, scale: 1 }}
              exit={{ y: -6, scale: 0.98, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 34 }}
              className="glass relative w-full max-w-[620px] overflow-hidden rounded-[22px] !bg-[#0a1222]/95"
              onKeyDown={onKeyDown}
            >
              <div className="flex items-center gap-3 border-b border-line px-5">
                <Search className="size-[18px] text-muted" />
                <input
                  ref={input}
                  value={q}
                  onChange={(e) => {
                    setQ(e.target.value);
                    setActive(0);
                  }}
                  placeholder="Search 300+ components, categories or stacks…"
                  className="h-14 flex-1 bg-transparent text-[15px] text-text outline-none placeholder:text-faint"
                  aria-label="Search"
                />
                <kbd className="pill rounded-md px-1.5 py-0.5 font-mono text-[11px] text-muted">esc</kbd>
              </div>
              <div ref={list} className="scrollbar-thin max-h-[56vh] overflow-y-auto p-2">
                {results.cats.length > 0 && <p className="px-3 pb-1 pt-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Categories</p>}
                {results.cats.map((c) => {
                  index++;
                  const i = index;
                  return (
                    <button
                      key={c.slug}
                      data-index={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(`/library/${c.slug}`)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${active === i ? "bg-surface-2" : ""}`}
                    >
                      <span className="pill grid size-8 place-items-center rounded-lg text-accent">
                        <Layers className="size-4" />
                      </span>
                      <span className="flex-1 text-[14px] text-text">{c.name}</span>
                      <span className="font-mono text-[12px] text-faint">{c.count}</span>
                      {active === i && <CornerDownLeft className="size-3.5 text-muted" />}
                    </button>
                  );
                })}
                {results.comps.length > 0 && <p className="px-3 pb-1 pt-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">Components</p>}
                {results.comps.map((c) => {
                  index++;
                  const i = index;
                  return (
                    <button
                      key={c.id}
                      data-index={i}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(`/c/${c.id}`)}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left ${active === i ? "bg-surface-2" : ""}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={posterSrc(c.id)} alt="" loading="lazy" className="h-9 w-14 rounded-md object-cover ring-1 ring-white/10" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14px] text-text">{c.title}</span>
                        <span className="block truncate text-[12px] text-muted">
                          {c.categoryName}
                          {c.tags.length ? ` · ${c.tags.slice(0, 3).join(", ")}` : ""}
                        </span>
                      </span>
                      {active === i && <ArrowRight className="size-4 text-accent" />}
                    </button>
                  );
                })}
                {flat.length === 0 && <p className="px-3 py-10 text-center text-[14px] text-muted">Nothing matches “{q}”. Try a stack like “gsap” or “three”.</p>}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </PaletteContext.Provider>
  );
}
