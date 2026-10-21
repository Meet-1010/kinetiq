import { CategorySidebar } from "@/components/category-sidebar";
import { categories, totalComponents } from "@/lib/library";

export default function LibraryLayout({ children }: LayoutProps<"/library">) {
  return (
    <div className="mx-auto grid grid-cols-1 max-w-[1480px] gap-6 px-4 pt-6 sm:px-6 lg:grid-cols-[300px_1fr] lg:gap-10 lg:pt-10">
      <CategorySidebar categories={categories.map(({ slug, name, count }) => ({ slug, name, count }))} total={totalComponents} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
