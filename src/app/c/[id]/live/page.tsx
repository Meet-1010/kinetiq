import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { LiveFrame } from "@/components/live-frame";
import { liveDemo } from "@/lib/demos";
import { components, getCategory, getComponent } from "@/lib/library";

export function generateStaticParams() {
  return components.filter((c) => liveDemo(c.id)).map((c) => ({ id: c.id }));
}

export async function generateMetadata({ params }: PageProps<"/c/[id]/live">): Promise<Metadata> {
  const c = getComponent((await params).id);
  return c ? { title: `${c.title} · Live demo` } : {};
}

export default function LivePage({ params }: PageProps<"/c/[id]/live">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[60] bg-bg" />}>
      <Live params={params} />
    </Suspense>
  );
}

async function Live({ params }: { params: PageProps<"/c/[id]/live">["params"] }) {
  const c = getComponent((await params).id);
  const demo = c && liveDemo(c.id);
  if (!c || !demo) notFound();
  return <LiveFrame id={c.id} title={c.title} category={getCategory(c.category)?.name ?? c.category} url={demo.url} status={demo.status as "pass" | "warn"} />;
}
