import Link from "next/link";
import type { Component } from "@/lib/library";
import { VideoPreview } from "./video-preview";

/** Three counter-scrolling columns of live previews, tilted in perspective. */
export function HeroWall({ items }: { items: Component[] }) {
  const cols = [0, 1, 2].map((k) => items.filter((_, i) => i % 3 === k));
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_70%,transparent)] lg:pointer-events-auto"
    >
      <div className="absolute -right-[10%] top-[-10%] h-[130%] w-[85%] [perspective:1600px] lg:-right-[4%] lg:w-[62%]">
        <div className="grid h-full grid-cols-3 gap-4 [transform:rotateX(18deg)_rotateY(-16deg)_rotateZ(6deg)] [transform-style:preserve-3d]">
          {cols.map((col, k) => (
            <div key={k} className="relative overflow-hidden">
              <div className={k === 1 ? "marquee-down" : "marquee-up"} style={{ ["--dur" as string]: `${70 + k * 18}s` }}>
                {[...col, ...col].map((c, i) => (
                  <Link
                    key={`${c.id}-${i}`}
                    href={`/c/${c.id}`}
                    tabIndex={-1}
                    className="glass mb-4 block rounded-[22px] p-2 opacity-90 transition hover:opacity-100"
                  >
                    <VideoPreview id={c.id} hasVideo={c.hasVideo} title={c.title} className="aspect-[4/3] rounded-[16px]" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
