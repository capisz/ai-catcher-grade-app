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
    <nav aria-label="Primary navigation">
      <div className="flex gap-1 overflow-x-auto lg:flex-col lg:gap-2">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/scouting" && pathname.startsWith("/catcher/"));
          return (
            <LoadingLink
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              loadingMessage="Loading backstop.ai..."
              loadingSubtitle={`Opening ${item.label.toLowerCase()}.`}
              className={[
                "shrink-0 rounded-[10px] px-3 py-3 text-xs font-semibold transition lg:px-3.5 lg:text-sm",
                active
                  ? "bg-white/[0.07] text-white"
                  : "text-[#969dba] hover:bg-white/[0.04] hover:text-white",
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
