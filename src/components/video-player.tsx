"use client";

import { Maximize2, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { posterSrc, previewSrc } from "@/lib/library";

const SPEEDS = [0.5, 1, 1.5];

export function VideoPlayer({ id, hasVideo, title, aspect }: { id: string; hasVideo: boolean; title: string; aspect: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      if (bar.current && v.duration) bar.current.style.transform = `scaleX(${v.currentTime / v.duration})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (video.current) video.current.playbackRate = speed;
  }, [speed]);

  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const seek = (e: React.PointerEvent<HTMLDivElement>) => {
    const v = video.current;
    if (!v?.duration) return;
    const r = e.currentTarget.getBoundingClientRect();
    v.currentTime = ((e.clientX - r.left) / r.width) * v.duration;
  };

  const ratio = Math.min(Math.max(aspect || 16 / 9, 1.2), 2.2);

  return (
    <div ref={wrap} className="glass group relative overflow-hidden rounded-[28px] p-2.5 sm:p-3">
      <div className="relative overflow-hidden rounded-[20px] bg-black ring-1 ring-white/5" style={{ aspectRatio: ratio }}>
        {hasVideo ? (
          <video
            ref={video}
            key={id}
            src={previewSrc(id)}
            poster={posterSrc(id)}
            autoPlay
            muted
            loop
            playsInline
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onClick={toggle}
            aria-label={`${title} preview video`}
            className="absolute inset-0 size-full cursor-pointer object-contain"
          />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={posterSrc(id)} alt={`${title} preview`} className="absolute inset-0 size-full object-contain" />
        )}
      </div>

      {hasVideo && (
        <div className="flex items-center gap-2 px-1.5 pb-0.5 pt-3">
          <button onClick={toggle} aria-label={playing ? "Pause" : "Play"} className="pill grid size-9 place-items-center rounded-full text-text hover:text-accent">
            {playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
          </button>
          <button
            onClick={() => {
              if (video.current) video.current.currentTime = 0;
            }}
            aria-label="Restart"
            className="pill grid size-9 place-items-center rounded-full text-text-2 hover:text-text"
          >
            <RotateCcw className="size-4" />
          </button>
          <div onPointerDown={seek} className="relative mx-2 h-9 flex-1 cursor-pointer" role="presentation">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-white/10">
              <div ref={bar} className="h-full origin-left scale-x-0 rounded-full bg-gradient-to-r from-accent-2 to-accent" />
            </div>
          </div>
          <div className="pill flex h-9 items-center rounded-full p-1">
            {SPEEDS.map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`h-7 rounded-full px-2.5 font-mono text-[11.5px] transition ${speed === s ? "bg-white/10 text-text" : "text-muted hover:text-text"}`}
              >
                {s}×
              </button>
            ))}
          </div>
          <button
            onClick={() => wrap.current?.requestFullscreen?.()}
            aria-label="Fullscreen"
            className="pill hidden size-9 place-items-center rounded-full text-text-2 hover:text-text sm:grid"
          >
            <Maximize2 className="size-4" />
          </button>
        </div>
      )}
    </div>
  );
}
