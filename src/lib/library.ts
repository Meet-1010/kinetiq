import data from "@/data/library.json";

export type Category = {
  slug: string;
  name: string;
  singular: string;
  blurb: string;
  count: number;
};

export type Component = {
  id: string;
  number: number;
  category: string;
  title: string;
  hasVideo: boolean;
  aspect: number;
  duration: number;
  hasCode: boolean;
  zipSize: number;
  framework: string | null;
  bundler: string | null;
  tags: string[];
  scripts: string[];
  hasPackageJson: boolean;
  fileCount: number;
  files: string[];
  source: string | null;
  hasLicense: boolean;
};

type Library = { generatedAt: string; total: number; categories: Category[]; components: Component[] };

const library = data as Library;

export const categories = library.categories;
export const components = library.components;
export const totalComponents = library.total;

const byId = new Map(components.map((c) => [c.id, c]));
const bySlug = new Map(categories.map((c) => [c.slug, c]));

export const getComponent = (id: string) => byId.get(id);
export const getCategory = (slug: string) => bySlug.get(slug);
export const componentsIn = (slug: string) => components.filter((c) => c.category === slug);

export function neighbours(id: string) {
  const c = byId.get(id);
  if (!c) return { prev: undefined, next: undefined };
  const list = componentsIn(c.category);
  const i = list.findIndex((x) => x.id === id);
  return { prev: list[i - 1], next: list[i + 1] };
}

export const previewSrc = (id: string) => `/previews/${id}.mp4`;
export const posterSrc = (id: string) => `/previews/${id}.jpg`;

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 ** 2).toFixed(1)} MB`;
}

export const stackLabel = (c: Component) => [c.framework, c.bundler].filter(Boolean).join(" · ");

/** A deterministic spread of components across categories for the hero wall. */
export function showcase(count: number) {
  const pools = categories.map((cat) => componentsIn(cat.slug).filter((c) => c.hasVideo));
  const out: Component[] = [];
  for (let round = 0; out.length < count; round++) {
    let added = false;
    for (const pool of pools) {
      const pick = pool[(round * 7 + 3) % Math.max(pool.length, 1)];
      if (pick && !out.includes(pick)) {
        out.push(pick);
        added = true;
      }
      if (out.length >= count) break;
    }
    if (!added) break;
  }
  return out;
}
