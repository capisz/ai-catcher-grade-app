"use client";

import { usePathname } from "next/navigation";

import { LoadingLink } from "@/components/ui/loading-link";

const NAV_ITEMS = [
  { href: "/", label: "Scouting" },
  { href: "/compare", label: "Compare" },
  { href: "/matchup-explorer", label: "Game" },
  { href: "/research", label: "Research" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-1.5 rounded-[1rem] border border-line/60 bg-[color:var(--nav-surface)] p-1.5 shadow-[0_10px_24px_rgba(68,83,95,0.06)]">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/" && pathname.startsWith("/catcher/"));
          return (
            <LoadingLink
              key={item.href}
              href={item.href}
              style={active ? { color: "var(--nav-active-text)" } : undefined}
              loadingMessage="Loading catcher intelligence..."
              loadingSubtitle={`Opening ${item.label.toLowerCase()}.`}
              className={[
                "rounded-[0.8rem] border px-3.5 py-2.5 text-sm font-semibold transition",
                active
                  ? "border-[color:var(--nav-active-border)] bg-[color:var(--nav-active)] text-white shadow-[0_10px_18px_rgba(68,83,95,0.18)]"
                  : "border-transparent bg-[color:var(--nav-chip)] text-muted hover:border-line/50 hover:bg-[color:var(--nav-chip-hover)] hover:text-ink",
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
