"use client";

import Link from "next/link";
import { Gem } from "lucide-react";
import type { Component } from "@/lib/library";
import { useAccess } from "./access-provider";
import { VideoPreview } from "./video-preview";

export function trackSpotlight(e: React.PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
}

export function ComponentCard({ c, categoryName, eager }: { c: Component; categoryName?: string; eager?: boolean }) {
  const { access, openUnlock } = useAccess();
  const unlocked = Boolean(access?.starred);

  return (
    <article
      onPointerMove={trackSpotlight}
      className="glass spotlight group relative rounded-[28px] p-3 transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] hover:-translate-y-1"
    >
      <Link href={`/c/${c.id}`} className="block rounded-[20px] outline-none" aria-label={`Open ${c.title}`}>
        <VideoPreview
          id={c.id}
          hasVideo={c.hasVideo}
          title={c.title}
          eager={eager}
          className="aspect-[16/10] rounded-[20px] ring-1 ring-white/5 transition duration-500 group-hover:ring-accent/25"
        />
        <span className="absolute inset-x-3 top-3 flex justify-between p-3 opacity-0 transition duration-300 group-hover:opacity-100">
          <span className="rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-white/85 backdrop-blur">
            {categoryName ?? c.category} · {String(c.number).padStart(2, "0")}
          </span>
          {c.framework && (
            <span className="rounded-full bg-black/55 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider text-white/85 backdrop-blur">
              {c.framework}
            </span>
          )}
        </span>
      </Link>
      <div className="flex items-center gap-3 px-3 pb-2 pt-4">
        <Link href={`/c/${c.id}`} className="min-w-0 flex-1">
          <h3 className="truncate text-[17px] font-semibold tracking-[-0.01em] text-text sm:text-[19px]">{c.title}</h3>
          <p className="mt-0.5 truncate text-[12.5px] text-muted">{c.tags.slice(0, 3).join(" · ") || c.framework || " "}</p>
        </Link>
        {unlocked ? (
          <a
            href={`/api/download/${c.id}`}
            aria-label={`Download ${c.title} source`}
            title="Download source"
            className="grid size-11 shrink-0 place-items-center rounded-2xl bg-accent/12 text-accent shadow-[0_0_18px_-4px_rgba(79,216,255,0.6)] ring-1 ring-accent/40 transition hover:bg-accent/20"
          >
            <Gem className="size-[19px]" />
          </a>
        ) : (
          <button
            onClick={openUnlock}
            aria-label={`Unlock ${c.title} source`}
            title="Star on GitHub to unlock"
            className="pill grid size-11 shrink-0 place-items-center rounded-2xl text-text-2 transition hover:text-accent hover:shadow-[0_0_18px_-4px_rgba(79,216,255,0.5)]"
          >
            <Gem className="size-[19px]" />
          </button>
        )}
      </div>
    </article>
  );
}
