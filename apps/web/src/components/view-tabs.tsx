import { LoadingLink } from "@/components/ui/loading-link";

type ViewTab = {
  key: string;
  label: string;
  href: string;
};

type ViewTabsProps = {
  items: ViewTab[];
  active: string;
};

/**
 * URL-driven segmented control for switching between a page's intent views
 * (?view=<key>). Styled to match AppNav so section navigation reads as one
 * consistent pattern across the app.
 */
export function ViewTabs({ items, active }: ViewTabsProps) {
  return (
    <nav className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-1 rounded-lg bg-background-subtle p-1">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <LoadingLink
              key={item.key}
              href={item.href}
              loadingMessage={`Loading ${item.label.toLowerCase()}...`}
              loadingSubtitle="Switching section view."
              className={[
                "rounded-md px-3 py-1.5 text-sm font-semibold transition",
                isActive
                  ? "bg-surface-strong text-white"
                  : "text-muted hover:text-ink",
              ].join(" ")}
            >
              {item.label}
            </LoadingLink>
          );
        })}
      </div>
    </nav>
  );
}
