import Link from "next/link";
import { ArrowRight } from "lucide-react";

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-4 py-32 text-center">
      <p className="font-mono text-[12px] uppercase tracking-[0.2em] text-accent">404</p>
      <h1 className="font-display mt-3 text-[40px] font-medium tracking-[-0.03em]">This one didn’t animate in.</h1>
      <p className="mt-3 text-[15px] text-text-2">The page you’re after doesn’t exist, or the component moved.</p>
      <Link href="/library" className="accent-fill mt-8 flex h-11 items-center gap-2 rounded-full px-5 text-[14px] font-semibold">
        Back to the library <ArrowRight className="size-4" />
      </Link>
    </div>
  );
}
