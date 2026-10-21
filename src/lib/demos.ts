import report from "@/data/demos.json";

export type DemoStatus = "pass" | "warn" | "fail";
type DemoEntry = { status: DemoStatus; kind?: string };

const demos = (report as { demos: Record<string, DemoEntry> }).demos;

/** Live demos are served from their own origin (see scripts/demo-server.mjs), never from this site. */
export const demoOrigin = (process.env.NEXT_PUBLIC_DEMO_ORIGIN ?? "http://localhost:3100").replace(/\/$/, "");

/** A demo is shown only if headless Chrome saw it render; "warn" means it runs but logged errors. */
export function liveDemo(id: string) {
  const d = demos[id];
  if (!d || d.status === "fail") return null;
  return { status: d.status, url: `${demoOrigin}/${id}/` };
}

/** Annotate components with their live-demo status for client components. */
export const withLive = <T extends { id: string }>(items: T[]) =>
  items.map((c) => {
    const s = demos[c.id]?.status;
    return s && s !== "fail" ? { ...c, live: s } : c;
  });

export const liveCount = () => Object.values(demos).filter((d) => d.status !== "fail").length;
