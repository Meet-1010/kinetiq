"use client";

import { Check, Copy, Download, Gem, Loader2 } from "lucide-react";
import { useState } from "react";
import { formatBytes, type Component } from "@/lib/library";
import { useAccess } from "./access-provider";

function CopyLine({ cmd }: { cmd: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(cmd);
        setDone(true);
        setTimeout(() => setDone(false), 1400);
      }}
      className="group flex w-full items-center gap-3 rounded-xl bg-black/30 px-3.5 py-2.5 text-left ring-1 ring-white/5 transition hover:ring-accent/30"
    >
      <span className="font-mono text-[12px] text-accent">$</span>
      <code className="flex-1 font-mono text-[13px] text-text">{cmd}</code>
      {done ? <Check className="size-3.5 text-accent" /> : <Copy className="size-3.5 text-faint group-hover:text-text-2" />}
    </button>
  );
}

export function DownloadPanel({ c }: { c: Component }) {
  const { access, loading, openUnlock } = useAccess();
  const unlocked = Boolean(access?.starred);
  const devScript = c.scripts.includes("dev") ? "npm run dev" : c.scripts.includes("start") ? "npm start" : null;

  return (
    <div className="space-y-5">
      {loading && !access ? (
        <div className="skeleton h-12 rounded-full" />
      ) : unlocked ? (
        <a href={`/api/download/${c.id}`} className="accent-fill flex h-12 items-center justify-center gap-2.5 rounded-full text-[15px] font-semibold">
          <Download className="size-[18px]" /> Download source <span className="font-mono text-[12px] opacity-60">{formatBytes(c.zipSize)}</span>
        </a>
      ) : (
        <button onClick={openUnlock} className="accent-fill flex h-12 w-full items-center justify-center gap-2.5 rounded-full text-[15px] font-semibold">
          {loading ? <Loader2 className="size-[18px] animate-spin" /> : <Gem className="size-[18px]" />}
          Star on GitHub to unlock
        </button>
      )}

      <div>
        <p className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">Run it locally</p>
        <div className="space-y-2">
          {c.hasPackageJson ? (
            <>
              <CopyLine cmd="npm install" />
              {devScript && <CopyLine cmd={devScript} />}
            </>
          ) : (
            <p className="rounded-xl bg-black/30 px-3.5 py-2.5 text-[13px] text-text-2 ring-1 ring-white/5">
              No build step. Unzip and open <code className="font-mono text-accent">index.html</code>, or serve the folder with any static server.
            </p>
          )}
        </div>
        {devScript === "npm run dev" && c.bundler === "Vite" && (
          <p className="mt-2 text-[12.5px] text-muted">
            Then open <span className="font-mono text-text-2">localhost:5173</span>
          </p>
        )}
      </div>
    </div>
  );
}
