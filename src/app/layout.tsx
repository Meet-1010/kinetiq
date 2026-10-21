import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Space_Grotesk } from "next/font/google";
import { AccessProvider } from "@/components/access-provider";
import { CommandPaletteProvider } from "@/components/command-palette";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { categories, components, getCategory, totalComponents } from "@/lib/library";
import { site } from "@/lib/site";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const display = Space_Grotesk({ variable: "--font-display", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = JetBrains_Mono({ variable: "--font-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: `${site.name} | ${site.tagline}`, template: `%s · ${site.name}` },
  description: `${totalComponents}+ motion components. ${site.description}`,
  openGraph: { title: site.name, description: site.tagline, type: "website" },
  twitter: { card: "summary_large_image", title: site.name, description: site.tagline },
};

export const viewport: Viewport = { themeColor: "#060a14" };

const paletteItems = components.map((c) => ({
  id: c.id,
  title: c.title,
  category: c.category,
  categoryName: getCategory(c.category)?.name ?? c.category,
  tags: c.tags,
}));
const paletteCategories = categories.map(({ slug, name, count }) => ({ slug, name, count }));

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable} antialiased`}>
      <body className="flex min-h-dvh flex-col">
        <AccessProvider>
          <CommandPaletteProvider items={paletteItems} categories={paletteCategories}>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </CommandPaletteProvider>
        </AccessProvider>
      </body>
    </html>
  );
}
