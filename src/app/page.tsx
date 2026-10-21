import Link from "next/link";
import { ArrowRight, Download, Star } from "lucide-react";
import { HeroWall } from "@/components/hero-wall";
import { GithubIcon } from "@/components/icons";
import { SearchButton } from "@/components/header-controls";
import { VideoPreview } from "@/components/video-preview";
import { categories, components, componentsIn, showcase, totalComponents } from "@/lib/library";
import { repoUrl, site } from "@/lib/site";

const stackCount = new Set(components.flatMap((c) => c.tags)).size;
const wall = showcase(24);

const steps = [
  {
    icon: GithubIcon,
    title: "Sign in with GitHub",
    body: "One click, read-only. We only see your public profile, never your repos.",
  },
  {
    icon: Star,
    title: `Star ${site.starRepo}`,
    body: "That’s the whole price. It helps the library reach more people.",
  },
  {
    icon: Download,
    title: "Download anything",
    body: `Full, runnable source for all ${totalComponents} components. No limits, no expiry.`,
  },
];

export default function Home() {
  return (
    <>
      {/* Hero */}
      <section className="relative isolate min-h-[640px] overflow-hidden border-b border-line/60 lg:min-h-[760px]">
        <div className="grid-lines absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_30%_40%,black,transparent_70%)]" />
        <div className="absolute inset-0 -z-10 opacity-35 lg:opacity-100">
          <HeroWall items={wall} />
        </div>
        <div className="absolute inset-y-0 left-0 -z-10 w-full bg-gradient-to-r from-[#060a14] via-[#060a14]/85 to-transparent lg:w-[62%]" />

        <div className="mx-auto flex max-w-[1480px] flex-col justify-center px-4 pb-20 pt-20 sm:px-6 lg:min-h-[760px] lg:pt-10">
          <div className="max-w-[640px]">
            <Link
              href="/library"
              className="pill inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-[13px] text-text-2 transition hover:text-text"
            >
              <span className="accent-fill rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold">{totalComponents}+</span>
              motion components across {categories.length} categories
              <ArrowRight className="size-3.5" />
            </Link>
            <h1 className="font-display mt-7 text-[46px] font-medium leading-[0.98] tracking-[-0.035em] sm:text-[64px] lg:text-[80px]">
              <span className="text-gradient">Motion components,</span>
              <br />
              <span className="text-gradient">ready to ship.</span>
            </h1>
            <p className="mt-6 max-w-[520px] text-[17px] leading-relaxed text-text-2">
              Scroll scenes, WebGL shaders, page transitions and hover effects, collected and organized by {site.author}.
              Watch every one live, then grab the full source with a single GitHub star.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/library" className="accent-fill flex h-12 items-center gap-2 rounded-full px-6 text-[15px] font-semibold">
                Browse the library <ArrowRight className="size-4" />
              </Link>
              <a href={repoUrl} target="_blank" rel="noreferrer" className="pill flex h-12 items-center gap-2.5 rounded-full px-5 text-[15px] text-text hover:bg-surface-2">
                <GithubIcon className="size-[18px]" /> Star on GitHub
              </a>
            </div>
            <div className="mt-6 max-w-sm sm:hidden">
              <SearchButton wide />
            </div>

            <dl className="mt-14 grid max-w-[520px] grid-cols-3 gap-6 border-t border-line pt-6">
              {[
                [totalComponents, "components"],
                [categories.length, "categories"],
                [stackCount, "libraries & stacks"],
              ].map(([n, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd className="font-display text-[30px] font-medium tabular-nums tracking-[-0.02em]">{n}</dd>
                  <dd className="text-[13px] text-muted">{label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* Categories */}
      <section id="categories" className="mx-auto max-w-[1480px] scroll-mt-20 px-4 pt-24 sm:px-6">
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Browse by feel</p>
            <h2 className="font-display mt-2 text-[34px] font-medium tracking-[-0.025em] sm:text-[44px]">Fourteen ways to move</h2>
          </div>
          <Link href="/library" className="flex items-center gap-1.5 text-[14px] text-accent hover:underline">
            See everything <ArrowRight className="size-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {categories.map((cat, i) => {
            const lead = componentsIn(cat.slug).find((c) => c.hasVideo) ?? componentsIn(cat.slug)[0];
            return (
              <Link
                key={cat.slug}
                href={`/library/${cat.slug}`}
                className={`glass spotlight group rounded-[26px] p-2.5 transition-transform duration-500 hover:-translate-y-1 ${i === 0 ? "sm:col-span-2 sm:row-span-2" : ""}`}
              >
                <VideoPreview
                  id={lead.id}
                  hasVideo={lead.hasVideo}
                  title={cat.name}
                  className={`rounded-[18px] ring-1 ring-white/5 ${i === 0 ? "aspect-[16/10] sm:aspect-auto sm:h-[calc(100%-92px)]" : "aspect-[16/10]"}`}
                />
                <div className="flex items-start justify-between gap-3 px-2.5 pb-2 pt-4">
                  <div className="min-w-0">
                    <h3 className="text-[17px] font-semibold">{cat.name}</h3>
                    <p className="mt-1 line-clamp-1 text-[13px] text-muted">{cat.blurb}</p>
                  </div>
                  <span className="pill shrink-0 rounded-full px-2.5 py-1 font-mono text-[12px] text-text-2 group-hover:text-accent">{cat.count}</span>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* How unlocking works */}
      <section id="unlock" className="mx-auto max-w-[1480px] scroll-mt-20 px-4 pt-28 sm:px-6">
        <div className="glass relative overflow-hidden rounded-[36px] px-6 py-14 sm:px-12">
          <div className="pointer-events-none absolute -right-20 -top-40 h-96 w-96 rounded-full bg-accent/15 blur-[100px]" />
          <div className="relative grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div>
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-accent">Free, with one condition</p>
              <h2 className="font-display mt-3 text-[34px] font-medium leading-[1.05] tracking-[-0.025em] sm:text-[44px]">
                Previews are free.
                <br />
                <span className="text-muted">The code costs a star.</span>
              </h2>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-text-2">
                Everyone can watch every component. To download the source, star the repo on GitHub. We check it
                automatically, so there’s no form, email or waiting.
              </p>
            </div>
            <ol className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {steps.map((s, i) => (
                <li key={s.title} className="relative rounded-[24px] bg-black/25 p-5 ring-1 ring-white/[0.06]">
                  <span className="font-mono text-[12px] text-faint">0{i + 1}</span>
                  <s.icon className="mt-6 size-6 text-accent" />
                  <h3 className="mt-4 text-[16px] font-semibold">{s.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>
    </>
  );
}
