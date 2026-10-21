"use client";

import { useEffect, useRef, useState } from "react";
import { posterSrc, previewSrc } from "@/lib/library";

/**
 * Lazy looping preview. The <source> is attached only when the card nears the viewport,
 * and playback runs only while it's actually visible, so a grid of 70 videos stays cheap.
 */
export function VideoPreview({
  id,
  hasVideo,
  title,
  className = "",
  eager = false,
}: {
  id: string;
  hasVideo: boolean;
  title: string;
  className?: string;
  eager?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [near, setNear] = useState(eager);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const v = ref.current;
    if (!v || !hasVideo) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const loader = new IntersectionObserver(([e]) => e.isIntersecting && setNear(true), { rootMargin: "400px 0px" });
    const player = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !reduced) v.play().catch(() => {});
        else v.pause();
      },
      { threshold: 0.3 },
    );
    loader.observe(v);
    player.observe(v);
    const onEnter = () => reduced && v.play().catch(() => {});
    const onLeave = () => reduced && v.pause();
    v.addEventListener("pointerenter", onEnter);
    v.addEventListener("pointerleave", onLeave);
    return () => {
      loader.disconnect();
      player.disconnect();
      v.removeEventListener("pointerenter", onEnter);
      v.removeEventListener("pointerleave", onLeave);
    };
  }, [hasVideo]);

  return (
    <div className={`relative overflow-hidden bg-[#0b1322] ${className}`}>
      {!ready && <div className="skeleton absolute inset-0" />}
      {hasVideo ? (
        <video
          ref={ref}
          muted
          loop
          playsInline
          preload={near ? "metadata" : "none"}
          poster={posterSrc(id)}
          aria-label={`${title} preview`}
          onLoadedData={() => setReady(true)}
          onCanPlay={() => setReady(true)}
          className="absolute inset-0 size-full object-cover"
        >
          {near && <source src={previewSrc(id)} type="video/mp4" />}
        </video>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={posterSrc(id)} alt={`${title} preview`} loading="lazy" onLoad={() => setReady(true)} className="absolute inset-0 size-full object-cover" />
      )}
    </div>
  );
}
