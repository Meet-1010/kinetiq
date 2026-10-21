import Link from "next/link";
import { categories } from "@/lib/library";
import { repoUrl, site } from "@/lib/site";
import { GithubIcon, Logomark } from "./icons";

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line/70">
      <div className="mx-auto grid grid-cols-1 max-w-[1480px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.2fr_2fr]">
        <div>
          <div className="flex items-center gap-2.5">
            <Logomark className="size-8" />
            <span className="font-display text-[19px] font-medium">{site.name}</span>
          </div>
          <p className="mt-4 max-w-sm text-[14px] leading-relaxed text-muted">
            Curated by {site.author}. Original demos keep their authors’ licenses. Check each project’s README and credit the
            source when you ship.
          </p>
          <a href={repoUrl} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 text-[14px] text-text-2 hover:text-text">
            <GithubIcon className="size-4" /> {site.starRepo}
          </a>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3">
          {categories.map((c) => (
            <Link key={c.slug} href={`/library/${c.slug}`} className="text-[14px] text-muted transition hover:text-text">
              {c.name} <span className="font-mono text-[12px] text-faint">{c.count}</span>
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
