import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink, FileCode2 } from "lucide-react";
import { Suspense } from "react";
import { ComponentCard } from "@/components/component-card";
import { DetailSkeleton } from "@/components/skeletons";
import { DownloadPanel } from "@/components/download-panel";
import { KeyboardNav } from "@/components/keyboard-nav";
import { VideoPlayer } from "@/components/video-player";
import { categories, componentsIn, components, formatBytes, getCategory, getComponent, neighbours, posterSrc } from "@/lib/library";

const names = Object.fromEntries(categories.map((c) => [c.slug, c.name]));

export function generateStaticParams() {
  return components.map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/c/[id]">): Promise<Metadata> {
  const c = getComponent((await params).id);
  if (!c) return {};
  const cat = getCategory(c.category);
  return {
    title: c.title,
    description: `${c.title}: a ${cat?.singular.toLowerCase()} built with ${[c.framework, ...c.tags].filter(Boolean).join(", ")}.`,
    openGraph: { images: [posterSrc(c.id)] },
  };
}

function Meta({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-black/20 px-3.5 py-3 ring-1 ring-white/5">
      <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">{label}</p>
      <p className="mt-1 truncate text-[14px] text-text">{value}</p>
    </div>
  );
}

export default function ComponentPage({ params }: PageProps<"/c/[id]">) {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <ComponentDetail params={params} />
    </Suspense>
  );
}

async function ComponentDetail({ params }: { params: PageProps<"/c/[id]">["params"] }) {
  const c = getComponent((await params).id);
  if (!c) notFound();
  const cat = getCategory(c.category)!;
  const { prev, next } = neighbours(c.id);
  const siblings = componentsIn(c.category);
  const position = siblings.findIndex((x) => x.id === c.id) + 1;
  const more = siblings.filter((x) => x.id !== c.id).slice(Math.max(0, position - 1), Math.max(0, position - 1) + 3);
  const sourceHost = c.source ? new URL(c.source).hostname.replace(/^www\./, "") : null;

  return (
    <div className="mx-auto max-w-[1480px] px-4 pt-6 sm:px-6 lg:pt-8">
      <KeyboardNav prev={prev?.id} next={next?.id} />

      <nav aria-label="Breadcrumb" className="mb-5 flex items-center gap-1.5 text-[13px] text-muted">
        <Link href="/library" className="hover:text-text">
          Library
        </Link>
        <ChevronRight className="size-3.5 text-faint" />
        <Link href={`/library/${cat.slug}`} className="hover:text-text">
          {cat.name}
        </Link>
        <ChevronRight className="size-3.5 text-faint" />
        <span className="truncate text-text-2">{c.title}</span>
      </nav>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        <div className="min-w-0 space-y-6">
          <VideoPlayer id={c.id} hasVideo={c.hasVideo} title={c.title} aspect={c.aspect} />

          {c.files.length > 0 && (
            <section className="glass rounded-[24px] p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                  <FileCode2 className="size-4 text-accent" /> What’s inside
                </h2>
                <span className="font-mono text-[12px] text-muted">{c.fileCount} files</span>
              </div>
              <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 font-mono text-[12.5px] text-text-2 sm:grid-cols-2">
                {c.files.slice(0, 20).map((f) => {
                  const parts = f.split("/");
                  const shown = parts.length > 1 && c.files.every((x) => x.startsWith(parts[0] + "/")) ? parts.slice(1).join("/") : f;
                  return (
                    <li key={f} className="truncate">
                      <span className="text-faint">└ </span>
                      {shown}
                    </li>
                  );
                })}
              </ul>
              {c.files.length > 20 && <p className="mt-3 font-mono text-[12px] text-faint">+ {c.fileCount - 20} more</p>}
            </section>
          )}
        </div>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="glass rounded-[28px] p-6">
            <div className="flex items-center gap-2">
              <Link href={`/library/${cat.slug}`} className="pill rounded-full px-3 py-1 text-[12.5px] text-accent hover:bg-surface-2">
                {cat.name}
              </Link>
              <span className="font-mono text-[12px] text-faint">
                {String(position).padStart(2, "0")} / {String(siblings.length).padStart(2, "0")}
              </span>
            </div>
            <h1 className="font-display mt-4 text-[30px] font-medium leading-[1.1] tracking-[-0.02em]">{c.title}</h1>

            {c.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {c.tags.map((t) => (
                  <span key={t} className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[12px] text-text-2 ring-1 ring-white/[0.06]">
                    {t}
                  </span>
                ))}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2">
              <Meta label="Framework" value={c.framework ?? "n/a"} />
              <Meta label="Tooling" value={c.bundler ?? (c.hasPackageJson ? "npm" : "None")} />
              <Meta label="Files" value={c.fileCount} />
              <Meta label="Download" value={formatBytes(c.zipSize)} />
            </div>

            <div className="my-6 h-px bg-gradient-to-r from-transparent via-line-strong to-transparent" />

            <DownloadPanel c={c} />

            {c.source && (
              <a href={c.source} target="_blank" rel="noreferrer" className="mt-5 flex items-center gap-2 text-[13px] text-muted hover:text-text">
                <ExternalLink className="size-3.5" /> Original demo on {sourceHost}
              </a>
            )}
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3">
            {prev ? (
              <Link href={`/c/${prev.id}`} className="pill group rounded-2xl p-3.5 transition hover:bg-surface-2">
                <span className="flex items-center gap-1 font-mono text-[11px] text-faint">
                  <ArrowLeft className="size-3 transition group-hover:-translate-x-0.5" /> Prev
                </span>
                <span className="mt-1 block truncate text-[13.5px] text-text-2">{prev.title}</span>
              </Link>
            ) : (
              <span />
            )}
            {next && (
              <Link href={`/c/${next.id}`} className="pill group rounded-2xl p-3.5 text-right transition hover:bg-surface-2">
                <span className="flex items-center justify-end gap-1 font-mono text-[11px] text-faint">
                  Next <ArrowRight className="size-3 transition group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 block truncate text-[13.5px] text-text-2">{next.title}</span>
              </Link>
            )}
          </div>
          <p className="mt-3 hidden text-center font-mono text-[11px] text-faint lg:block">← → to browse · space to pause</p>
        </aside>
      </div>

      {more.length > 0 && (
        <section className="mt-16">
          <div className="mb-6 flex items-end justify-between">
            <h2 className="font-display text-[26px] font-medium tracking-[-0.02em]">More {cat.name.toLowerCase()}</h2>
            <Link href={`/library/${cat.slug}`} className="flex items-center gap-1 text-[14px] text-accent hover:underline">
              View all {cat.count} <ArrowRight className="size-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
            {more.map((m) => (
              <ComponentCard key={m.id} c={m} categoryName={names[m.category]} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
