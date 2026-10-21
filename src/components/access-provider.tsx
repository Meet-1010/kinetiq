"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { UnlockDialog } from "./unlock-dialog";

export type Access = {
  mode: "github" | "dev-open" | "unconfigured";
  user: { login: string; name: string | null; avatar: string } | null;
  starred: boolean;
};

type Ctx = {
  access: Access | null;
  loading: boolean;
  refresh: () => Promise<Access | null>;
  openUnlock: () => void;
  signOut: () => Promise<void>;
};

const AccessContext = createContext<Ctx | null>(null);

export function useAccess() {
  const ctx = useContext(AccessContext);
  if (!ctx) throw new Error("useAccess must be used inside <AccessProvider>");
  return ctx;
}

export function AccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  // `loading` only covers the first fetch; later refreshes keep showing the last known state.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/me", { cache: "no-store" });
      const next = (await res.json()) as Access;
      setAccess(next);
      return next;
    } catch {
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    fetch("/api/me", { cache: "no-store" })
      .then((r) => r.json() as Promise<Access>)
      .catch(() => null)
      .then((a) => {
        if (!alive) return;
        setAccess(a);
        setLoading(false);
        // Coming back from GitHub sign-in: continue the unlock flow where it left off.
        const url = new URL(window.location.href);
        const flag = url.searchParams.get("auth");
        if (!flag) return;
        url.searchParams.delete("auth");
        window.history.replaceState(null, "", url);
        if (flag === "failed" || (a && !a.starred)) setOpen(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const closeUnlock = useCallback(() => setOpen(false), []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    await refresh();
  }, [refresh]);

  const value = useMemo<Ctx>(
    () => ({ access, loading, refresh, openUnlock: () => setOpen(true), signOut }),
    [access, loading, refresh, signOut],
  );

  return (
    <AccessContext.Provider value={value}>
      {children}
      <UnlockDialog open={open} onClose={closeUnlock} />
    </AccessContext.Provider>
  );
}
