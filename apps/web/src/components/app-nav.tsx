"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "Dashboard" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/matchup-explorer", label: "Matchup Explorer" },
  { href: "/game-review", label: "Game Review" },
];

export function AppNav() {
  const pathname = usePathname();

  return (
    <nav className="overflow-x-auto">
      <div className="flex min-w-max items-center gap-1.5 rounded-[1.05rem] border border-line/60 bg-[rgba(255,250,242,0.82)] p-1.5 shadow-[0_10px_24px_rgba(8,33,29,0.05)]">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/" && pathname.startsWith("/catcher/"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={[
                "rounded-[0.8rem] px-3.5 py-2.5 text-sm font-semibold transition",
                active
                  ? "bg-surface-strong text-white shadow-[0_10px_18px_rgba(8,33,29,0.14)]"
                  : "text-muted hover:bg-white/78 hover:text-ink",
              ].join(" ")}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
