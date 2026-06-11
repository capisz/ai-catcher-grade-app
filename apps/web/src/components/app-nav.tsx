"use client";

import { usePathname } from "next/navigation";

import { LoadingLink } from "@/components/ui/loading-link";

const NAV_ITEMS = [
  { href: "/", label: "Live" },
  { href: "/scouting", label: "Scouting" },
  { href: "/compare", label: "Compare" },
  { href: "/matchup-explorer", label: "Game" },
  { href: "/research", label: "Research" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-1 rounded-lg bg-background-subtle p-1">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/scouting" && pathname.startsWith("/catcher/"));
          return (
            <LoadingLink
              key={item.href}
              href={item.href}
              loadingMessage="Loading catcher intelligence..."
              loadingSubtitle={`Opening ${item.label.toLowerCase()}.`}
              className={[
                "rounded-md px-3 py-1.5 text-sm font-semibold transition",
                active
                  ? "bg-accent text-white"
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
