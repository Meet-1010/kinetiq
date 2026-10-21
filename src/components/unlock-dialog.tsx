"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, ExternalLink, Loader2, Star, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { repoUrl, site } from "@/lib/site";
import { useAccess } from "./access-provider";
import { GithubIcon } from "./icons";

type StepState = "done" | "current" | "todo";

function Step({ n, state, title, children }: { n: number; state: StepState; title: string; children?: React.ReactNode }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      <span
        className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-semibold transition-colors ${
          state === "done" ? "accent-fill" : state === "current" ? "bg-accent/10 text-accent ring-1 ring-accent/50" : "pill text-muted"
        }`}
      >
        {state === "done" ? <Check className="size-4" strokeWidth={3} /> : n}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <p className={`text-[15px] font-medium ${state === "todo" ? "text-muted" : "text-text"}`}>{title}</p>
        {children && <div className="mt-3">{children}</div>}
      </div>
    </li>
  );
}

export function UnlockDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { access, refresh } = useAccess();
  const [checking, setChecking] = useState(false);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setCheckedOnce(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    window.addEventListener("keydown", onKey);
    panel.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  const signedIn = Boolean(access?.user);
  const starred = Boolean(access?.starred);
  const returnTo = typeof window === "undefined" ? "/" : window.location.pathname;

  async function verify() {
    setChecking(true);
    await refresh();
    setChecking(false);
    setCheckedOnce(true);
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] grid place-items-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <button aria-label="Close" className="absolute inset-0 bg-overlay/75 backdrop-blur-md" onClick={close} />
          <motion.div
            ref={panel}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="unlock-title"
            className="glass relative w-full max-w-[460px] overflow-hidden rounded-[28px] !bg-panel/95 p-7 outline-none"
            initial={{ y: 24, scale: 0.97, opacity: 0 }}
            animate={{ y: 0, scale: 1, opacity: 1 }}
            exit={{ y: 12, scale: 0.98, opacity: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
          >
            <div className="pointer-events-none absolute -top-32 left-1/2 h-64 w-[120%] -translate-x-1/2 rounded-full bg-accent/15 blur-3xl" />
            <button onClick={close} aria-label="Close dialog" className="pill absolute right-4 top-4 grid size-9 place-items-center rounded-full text-muted hover:text-text">
              <X className="size-4" />
            </button>

            {starred ? (
              <div className="relative py-4 text-center">
                <motion.div
                  initial={{ scale: 0.6, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 14 }}
                  className="accent-fill mx-auto grid size-16 place-items-center rounded-2xl"
                >
                  <Star className="size-7 fill-current" />
                </motion.div>
                <h2 id="unlock-title" className="font-display mt-6 text-2xl font-medium">
                  Library unlocked
                </h2>
                <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-text-2">
                  {access?.mode === "dev-open"
                    ? "Local dev mode: the GitHub gate is open because OAuth isn’t configured yet."
                    : `Thanks for the star${access?.user ? `, @${access.user.login}` : ""}. Every component's source is yours to download.`}
                </p>
                <button onClick={close} className="accent-fill mt-6 h-11 rounded-full px-6 text-[14px] font-semibold">
                  Start downloading
                </button>
              </div>
            ) : access?.mode === "unconfigured" ? (
              <div className="relative py-2">
                <h2 id="unlock-title" className="font-display text-2xl font-medium">
                  Downloads opening soon
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text-2">
                  Source downloads are being set up. Star the repo now and you’ll be first in line.
                </p>
                <a href={repoUrl} target="_blank" rel="noreferrer" className="accent-fill mt-6 inline-flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold">
                  <Star className="size-4" /> Star {site.starRepo}
                </a>
              </div>
            ) : (
              <div className="relative">
                <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-accent">Free forever · one star</p>
                <h2 id="unlock-title" className="font-display mt-2 text-[26px] font-medium leading-tight">
                  Unlock the source code
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-text-2">
                  Previews are open to everyone. The code is a thank-you for starring the repo, so it takes two clicks.
                </p>

                <ol className="relative mt-7 before:absolute before:bottom-8 before:left-4 before:top-8 before:w-px before:bg-line-strong">
                  <Step n={1} state={signedIn ? "done" : "current"} title={signedIn ? `Signed in as @${access!.user!.login}` : "Sign in with GitHub"}>
                    {!signedIn && (
                      <a
                        href={`/api/auth/github?returnTo=${encodeURIComponent(returnTo)}`}
                        className="inline-flex h-10 items-center gap-2 rounded-full bg-white px-4 text-[14px] font-semibold text-ink transition hover:bg-white/90"
                      >
                        <GithubIcon className="size-4" /> Continue with GitHub
                      </a>
                    )}
                    {!signedIn && <p className="mt-2 text-[12px] text-muted">Read-only. We never ask for repo or write access.</p>}
                  </Step>
                  <Step n={2} state={!signedIn ? "todo" : "current"} title={`Star ${site.starRepo}`}>
                    {signedIn && (
                      <div className="flex flex-wrap items-center gap-2">
                        <a
                          href={repoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="pill inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-medium text-text hover:bg-surface-2"
                        >
                          <Star className="size-4 text-amber-300" /> Open repo to star <ExternalLink className="size-3.5 text-muted" />
                        </a>
                        <button
                          onClick={verify}
                          disabled={checking}
                          className="accent-fill inline-flex h-10 items-center gap-2 rounded-full px-4 text-[14px] font-semibold disabled:opacity-70"
                        >
                          {checking ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" strokeWidth={3} />}
                          I’ve starred it
                        </button>
                      </div>
                    )}
                    {signedIn && checkedOnce && !starred && !checking && (
                      <p className="mt-2 text-[12px] text-amber-200/90">No star found yet. GitHub can take a few seconds, so try again.</p>
                    )}
                  </Step>
                  <Step n={3} state="todo" title="Download any component" />
                </ol>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
