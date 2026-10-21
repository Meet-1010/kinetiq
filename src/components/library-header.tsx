export function LibraryHeader({ eyebrow, title, blurb, count }: { eyebrow: string; title: string; blurb: string; count: number }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        <h1 className="font-display mt-2 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] text-gradient sm:text-[44px]">{title}</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-2">{blurb}</p>
      </div>
      <p className="font-mono text-[13px] text-muted">
        <span className="text-text">{count}</span> components
      </p>
    </div>
  );
}
