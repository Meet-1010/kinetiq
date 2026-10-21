"use client";

import { Gem, LogOut, Search } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useAccess } from "./access-provider";
import { useOpenPalette } from "./command-palette";

const noopSubscribe = () => () => {};

export function SearchButton({ wide = false }: { wide?: boolean }) {
  const open = useOpenPalette();
  const mac = useSyncExternalStore(
    noopSubscribe,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => true,
  );
  return (
    <button
      onClick={open}
      aria-label="Search components"
      className={`pill flex h-10 items-center gap-2.5 rounded-full text-[13.5px] text-muted transition hover:text-text ${wide ? "w-full px-4 sm:w-64" : "px-3 md:w-56 md:px-4"}`}
    >
      <Search className="size-4" />
      <span className={wide ? "flex-1 text-left" : "hidden flex-1 text-left md:block"}>Search components</span>
      <kbd className={`rounded-md bg-white/5 px-1.5 py-0.5 font-mono text-[11px] text-faint ${wide ? "" : "hidden md:block"}`}>{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

export function AccountChip() {
  const { access, loading, openUnlock, signOut } = useAccess();
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setMenu(false);
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menu]);

  if (loading && !access) return <div className="skeleton h-10 w-28 rounded-full" />;

  if (access?.user) {
    return (
      <div ref={ref} className="relative">
        <button onClick={() => setMenu((m) => !m)} className="pill flex h-10 items-center gap-2 rounded-full pl-1 pr-3" aria-haspopup="menu" aria-expanded={menu}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={access.user.avatar} alt="" className="size-8 rounded-full ring-1 ring-white/10" />
          <span className={`size-2 rounded-full ${access.starred ? "bg-accent shadow-[0_0_8px_#ff6b35]" : "bg-amber-300"}`} />
          <span className="hidden text-[13px] text-text-2 sm:block">{access.starred ? "Unlocked" : "Star to unlock"}</span>
        </button>
        {menu && (
          <div role="menu" className="glass absolute right-0 top-12 z-50 w-56 rounded-2xl !bg-panel/95 p-2">
            <p className="px-3 py-2 text-[13px] text-muted">
              Signed in as <span className="text-text">@{access.user.login}</span>
            </p>
            {!access.starred && (
              <button role="menuitem" onClick={() => (setMenu(false), openUnlock())} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[14px] text-accent hover:bg-surface-2">
                <Gem className="size-4" /> Unlock downloads
              </button>
            )}
            <button role="menuitem" onClick={() => (setMenu(false), signOut())} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-[14px] text-text-2 hover:bg-surface-2">
              <LogOut className="size-4" /> Sign out
            </button>
          </div>
        )}
      </div>
    );
  }

  if (access?.starred) {
    return (
      <span className="pill flex h-10 items-center gap-2 rounded-full px-4 text-[13px] text-accent" title="OAuth not configured — gate open in local dev">
        <Gem className="size-4" /> Dev unlocked
      </span>
    );
  }

  return (
    <button onClick={openUnlock} className="accent-fill flex h-10 items-center gap-2 rounded-full px-4 text-[13.5px] font-semibold">
      <Gem className="size-4" /> <span>Unlock code</span>
    </button>
  );
}
