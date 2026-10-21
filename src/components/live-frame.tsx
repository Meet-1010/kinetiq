"use client";

import Link from "next/link";
import { ArrowLeft, Download, ExternalLink, Gem, Monitor, RotateCw, Smartphone, Tablet } from "lucide-react";
import { useState } from "react";
import { useAccess } from "./access-provider";
import { Logomark } from "./icons";

const SIZES = [
  { key: "desktop", label: "Desktop", icon: Monitor, width: "100%" },
  { key: "tablet", label: "Tablet", icon: Tablet, width: "820px" },
  { key: "mobile", label: "Mobile", icon: Smartphone, width: "390px" },
] as const;

export function LiveFrame({ id, title, category, url, status }: { id: string; title: string; category: string; url: string; status: "pass" | "warn" }) {
  const { access, openUnlock } = useAccess();
  const [size, setSize] = useState<(typeof SIZES)[number]["key"]>("desktop");
  const [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const width = SIZES.find((s) => s.key === size)!.width;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-line bg-panel/90 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
        <Link href={`/c/${id}`} className="pill grid size-9 place-items-center rounded-full text-text-2 hover:text-text" aria-label="Back to component">
          <ArrowLeft className="size-4" />
        </Link>
        <Link href="/" aria-label="Kinetiq home" className="hidden sm:block">
          <Logomark className="size-8" />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-semibold leading-tight">{title}</p>
          <p className="flex items-center gap-1.5 truncate text-[11.5px] text-muted">
            <span className={`size-1.5 rounded-full ${status === "pass" ? "bg-emerald-400" : "bg-amber-300"}`} />
            {category} · live demo
          </p>
        </div>

        <div className="pill hidden h-9 items-center rounded-full p-1 md:flex" role="group" aria-label="Viewport size">
          {SIZES.map((s) => (
            <button
              key={s.key}
              onClick={() => setSize(s.key)}
              aria-pressed={size === s.key}
              title={s.label}
              className={`grid h-7 w-9 place-items-center rounded-full transition ${size === s.key ? "bg-white/10 text-text" : "text-muted hover:text-text"}`}
            >
              <s.icon className="size-4" />
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            setLoaded(false);
            setNonce((n) => n + 1);
          }}
          className="pill grid size-9 place-items-center rounded-full text-text-2 hover:text-text"
          aria-label="Reload demo"
          title="Reload"
        >
          <RotateCw className="size-4" />
        </button>
        <a href={url} target="_blank" rel="noreferrer" className="pill hidden size-9 place-items-center rounded-full text-text-2 hover:text-text sm:grid" aria-label="Open demo in new tab" title="Open in new tab">
          <ExternalLink className="size-4" />
        </a>
        {access?.starred ? (
          <a href={`/api/download/${id}`} className="accent-fill flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold">
            <Download className="size-4" /> <span className="hidden sm:inline">Source</span>
          </a>
        ) : (
          <button onClick={openUnlock} className="accent-fill flex h-9 items-center gap-2 rounded-full px-4 text-[13px] font-semibold">
            <Gem className="size-4" /> <span className="hidden sm:inline">Get the code</span>
          </button>
        )}
      </div>

      <div className="relative flex flex-1 justify-center overflow-hidden bg-[#070605] p-0 md:p-3">
        {!loaded && (
          <div className="absolute inset-0 grid place-items-center">
            <div className="flex flex-col items-center gap-4">
              <Logomark className="size-12 animate-pulse" />
              <p className="font-mono text-[12px] text-muted">Loading live demo…</p>
            </div>
          </div>
        )}
        <iframe
          key={nonce}
          src={url}
          title={`${title} live demo`}
          onLoad={() => setLoaded(true)}
          // The demo runs on its own origin; these permissions apply to that origin only.
          sandbox="allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms"
          allow="fullscreen; autoplay; accelerometer; gyroscope; clipboard-write"
          referrerPolicy="no-referrer"
          className={`h-full max-w-full border-0 bg-white transition-[width,opacity] duration-500 md:rounded-[14px] md:ring-1 md:ring-line ${loaded ? "opacity-100" : "opacity-0"}`}
          style={{ width }}
        />
      </div>
    </div>
  );
}
