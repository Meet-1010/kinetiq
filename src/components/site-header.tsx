import Link from "next/link";
import { Star } from "lucide-react";
import { repoStars } from "@/lib/github";
import { repoUrl, site } from "@/lib/site";
import { AccountChip, SearchButton } from "./header-controls";
import { GithubIcon, Logomark } from "./icons";

const fmt = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

export async function SiteHeader() {
  const stars = await repoStars();
  return (
    <header className="sticky top-0 z-40 border-b border-line/60 bg-bg/75 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center gap-3 px-4 sm:gap-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5" aria-label={`${site.name} home`}>
          <Logomark className="size-8" />
          <span className="font-display text-[19px] font-medium tracking-[-0.02em]">{site.name}</span>
        </Link>
        <nav className="ml-4 hidden items-center gap-1 text-[14px] text-text-2 md:flex">
          <Link href="/library" className="rounded-full px-3 py-1.5 transition hover:bg-surface-2 hover:text-text">
            Library
          </Link>
          <Link href="/#categories" className="rounded-full px-3 py-1.5 transition hover:bg-surface-2 hover:text-text">
            Categories
          </Link>
          <Link href="/#unlock" className="rounded-full px-3 py-1.5 transition hover:bg-surface-2 hover:text-text">
            How it works
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <SearchButton />
          <a
            href={repoUrl}
            target="_blank"
            rel="noreferrer"
            className="pill hidden h-10 items-center gap-2 rounded-full px-3.5 text-[13px] text-text-2 transition hover:text-text sm:flex"
            aria-label={`Star ${site.starRepo} on GitHub`}
          >
            <GithubIcon className="size-4" />
            <Star className="size-3.5 text-amber-300" />
            <span className="font-mono tabular-nums">{stars === null ? "Star" : fmt(stars)}</span>
          </a>
          <AccountChip />
        </div>
      </div>
    </header>
  );
}
