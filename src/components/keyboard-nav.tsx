"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** ← / → step through components in the same category. */
export function KeyboardNav({ prev, next }: { prev?: string; next?: string }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target instanceof HTMLInputElement) return;
      if (e.key === "ArrowLeft" && prev) router.push(`/c/${prev}`);
      if (e.key === "ArrowRight" && next) router.push(`/c/${next}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prev, next, router]);
  return null;
}
