import type { SVGProps } from "react";

export function GithubIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .5C5.73.5.75 5.48.75 11.75c0 4.97 3.22 9.18 7.69 10.67.56.1.77-.24.77-.54v-1.9c-3.13.68-3.79-1.51-3.79-1.51-.51-1.3-1.25-1.65-1.25-1.65-1.02-.7.08-.69.08-.69 1.13.08 1.72 1.16 1.72 1.16 1 1.72 2.64 1.22 3.28.93.1-.73.39-1.22.71-1.5-2.5-.28-5.13-1.25-5.13-5.57 0-1.23.44-2.24 1.16-3.03-.12-.28-.5-1.43.11-2.98 0 0 .95-.3 3.1 1.16a10.7 10.7 0 0 1 5.64 0c2.15-1.46 3.1-1.16 3.1-1.16.61 1.55.23 2.7.11 2.98.72.79 1.16 1.8 1.16 3.03 0 4.33-2.64 5.28-5.15 5.56.4.35.76 1.03.76 2.08v3.08c0 .3.2.65.78.54a11.26 11.26 0 0 0 7.68-10.67C23.25 5.48 18.27.5 12 .5Z" />
    </svg>
  );
}

/**
 * Kinetiq mark — the "keyframe K". Stem and upper arm are solid; the lower leg is three
 * keyframes easing in along the diagonal (growing and spreading out, like an ease-in curve).
 * Keep in sync with src/app/icon.svg and public/brand/*.svg.
 */
export function Logomark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className={`kq-mark ${className ?? ""}`} {...props}>
      <defs>
        <linearGradient id="kq-tile" x1="0" y1="0" x2="0" y2="64" gradientUnits="userSpaceOnUse">
          <stop stopColor="#221B17" />
          <stop offset="1" stopColor="#100D0B" />
        </linearGradient>
        <linearGradient id="kq-ember" x1="16" y1="12" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop stopColor="#FFC46B" />
          <stop offset="0.45" stopColor="#FF6B35" />
          <stop offset="1" stopColor="#E3401C" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="62" height="62" rx="17" fill="url(#kq-tile)" />
      <rect x="1" y="1" width="62" height="62" rx="17" stroke="#FFE4D2" strokeOpacity="0.14" strokeWidth="1.5" />
      <path d="M18 3.5h28" stroke="#FFE8D8" strokeOpacity="0.12" strokeWidth="1" strokeLinecap="round" />
      {/* stem */}
      <rect x="16.5" y="13.5" width="8.5" height="37" rx="4.25" fill="url(#kq-ember)" />
      {/* upper arm */}
      <path d="M27.5 32.5 44.5 16" stroke="url(#kq-ember)" strokeWidth="8.5" strokeLinecap="round" />
      {/* lower leg as eased keyframes */}
      <circle className="kq-k1" cx="34.3" cy="39.1" r="2.4" fill="#FF6B35" fillOpacity="0.45" />
      <circle className="kq-k2" cx="39.7" cy="44.3" r="3.1" fill="#FF6B35" fillOpacity="0.75" />
      <circle className="kq-k3" cx="45.8" cy="50.2" r="4.3" fill="url(#kq-ember)" />
    </svg>
  );
}
