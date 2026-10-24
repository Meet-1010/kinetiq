// Shared types and helpers for the live-demo Customize panel. The panel talks to the runtime
// injected into every demo (scripts/customizer-runtime.js) via postMessage.

export type Caps = {
  vars: { name: string; value: string }[];
  background: string;
  text: string;
  images: number;
  bgImages?: number;
  canvas: boolean;
};

export type FontScope = "headings" | "all";

export type CustomState = {
  vars: Record<string, string>;
  background?: string;
  text?: string;
  font?: { family: string; scope: FontScope };
  rate: number;
};

export const EMPTY: CustomState = { vars: {}, rate: 1 };

export const FONTS = [
  "Inter",
  "Space Grotesk",
  "Bricolage Grotesque",
  "Syne",
  "Unbounded",
  "Archivo Black",
  "DM Serif Display",
  "Playfair Display",
  "Fraunces",
  "Instrument Serif",
  "JetBrains Mono",
  "Caveat",
] as const;

export const fontHref = (family: string) =>
  `https://fonts.googleapis.com/css2?family=${family.trim().replace(/ /g, "+")}:wght@400;500;600;700&display=swap`;

/** What the runtime receives: the font gets its stylesheet URL resolved here, on the trusted side. */
export const toRuntime = (s: CustomState) => ({
  vars: s.vars,
  background: s.background,
  text: s.text,
  rate: s.rate,
  font: s.font
    ? {
        family: s.font.family,
        scope: s.font.scope,
        href: fontHref(s.font.family),
      }
    : undefined,
});

export const isCustomized = (s: CustomState) =>
  Object.keys(s.vars).length > 0 ||
  !!s.background ||
  !!s.text ||
  !!s.font ||
  s.rate !== 1;

// "--color-bg-alt" -> "Bg alt"
export const prettyVar = (name: string) =>
  name
    .replace(/^--/, "")
    .replace(/^(color|colour|clr|c)[-_]/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

let ctx: CanvasRenderingContext2D | null | undefined;
/** Any CSS color -> #rrggbb for <input type=color>; null for transparent or unparseable values. */
export function toHex(value: string): string | null {
  if (typeof document === "undefined" || !value) return null;
  ctx ??= document.createElement("canvas").getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  const out = ctx.fillStyle;
  if (out.startsWith("#")) return out;
  const m = out.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?/);
  if (!m || (m[4] !== undefined && Number(m[4]) < 0.05)) return null;
  return (
    "#" +
    [m[1], m[2], m[3]]
      .map((n) => Number(n).toString(16).padStart(2, "0"))
      .join("")
  );
}

// ---- share links: the whole state in the URL hash (#c=…), no server involved.
export function encodeState(s: CustomState): string {
  const json = JSON.stringify(s);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function decodeState(
  raw: string | null | undefined,
): CustomState | null {
  if (!raw) return null;
  try {
    const json = decodeURIComponent(
      escape(atob(raw.replace(/-/g, "+").replace(/_/g, "/"))),
    );
    const v = JSON.parse(json) as Partial<CustomState>;
    const vars = Object.fromEntries(
      Object.entries(v.vars ?? {}).filter(
        ([k, val]) =>
          /^--[\w-]+$/.test(k) && typeof val === "string" && val.length < 64,
      ),
    );
    const color = (c: unknown) =>
      typeof c === "string" && c.length < 64 ? c : undefined;
    const font =
      v.font && (FONTS as readonly string[]).includes(v.font.family)
        ? {
            family: v.font.family,
            scope: v.font.scope === "all" ? "all" : "headings",
          }
        : undefined;
    const rate =
      typeof v.rate === "number" && v.rate >= 0 && v.rate <= 4 ? v.rate : 1;
    return {
      vars,
      background: color(v.background),
      text: color(v.text),
      font: font as CustomState["font"],
      rate,
    };
  } catch {
    return null;
  }
}

/** A stylesheet that reproduces the customizations when added after the component's own CSS. */
export function exportCss(
  title: string,
  s: CustomState,
  textChanges: { before: string; after: string }[],
): string {
  const lines = [
    `/* Kinetiq customizations for "${title}". Load this after the component's own styles. */`,
    "",
  ];
  if (s.font) lines.push(`@import url("${fontHref(s.font.family)}");`, "");
  const vars = Object.entries(s.vars);
  if (vars.length)
    lines.push(":root {", ...vars.map(([k, v]) => `  ${k}: ${v};`), "}", "");
  if (s.background)
    lines.push(`html, body { background-color: ${s.background}; }`);
  if (s.text) lines.push(`body { color: ${s.text}; }`);
  if (s.background || s.text) lines.push("");
  if (s.font) {
    const sel =
      s.font.scope === "all"
        ? "body, body *:not(code):not(pre)"
        : "h1, h2, h3, h4, h5, h6, [class*=title], [class*=heading]";
    lines.push(`${sel} { font-family: "${s.font.family}", sans-serif; }`, "");
  }
  if (s.rate !== 1) {
    lines.push(
      `/* Animation speed: ${s.rate}x. For GSAP-driven motion add this to the component's script:`,
      `   gsap.globalTimeline.timeScale(${s.rate});`,
      `   For CSS animations: document.getAnimations().forEach(a => a.playbackRate = ${s.rate}); */`,
      "",
    );
  }
  if (textChanges.length) {
    lines.push("/* Text you changed (update these in the HTML):");
    for (const t of textChanges)
      lines.push(
        `   "${t.before.replace(/\*\//g, "* /")}"  ->  "${t.after.replace(/\*\//g, "* /")}"`,
      );
    lines.push("*/");
  }
  return lines.join("\n") + "\n";
}
