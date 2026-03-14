import type { Metadata } from "next";
import Link from "next/link";
import { Newsreader, Space_Grotesk } from "next/font/google";

import { AppNav } from "@/components/app-nav";
import "./globals.css";

const bodyFont = Space_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Newsreader({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Catcher Intel",
  description: "Public-data catcher scouting dashboard for MLB game-calling evaluation.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased`}>
        <div className="relative min-h-screen overflow-x-hidden">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(196,163,106,0.09),transparent_28%),radial-gradient(circle_at_top_left,rgba(184,95,59,0.07),transparent_24%)]" />
          <header className="sticky top-0 z-40 border-b border-line/50 bg-[rgba(248,241,229,0.9)] backdrop-blur-xl">
            <div className="mx-auto max-w-[88rem] px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex flex-col gap-4 rounded-[1.35rem] border border-line/60 bg-[rgba(255,250,242,0.78)] px-4 py-3 shadow-[0_16px_30px_rgba(8,33,29,0.05)] lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-center gap-4">
                  <Link href="/" className="flex items-center gap-4">
                    <span className="relative flex h-11 w-11 items-center justify-center rounded-[0.95rem] border border-surface-strong/10 bg-surface-strong text-[0.7rem] font-semibold tracking-[0.24em] text-white shadow-[0_10px_18px_rgba(8,33,29,0.14)]">
                      <span className="absolute inset-[0.72rem] rotate-45 rounded-[0.42rem] border border-white/18" />
                      <span className="relative">CI</span>
                    </span>
                    <div>
                      <div className="label-kicker">Battery Room</div>
                      <div className="mt-1 font-serif text-[1.55rem] leading-none text-ink">
                        Catcher Intel
                      </div>
                      <div className="mt-1.5 text-sm text-muted">
                        Public MLB catcher scouting and pitch-decision analysis
                      </div>
                    </div>
                  </Link>
                </div>
                <div className="flex flex-col gap-3 lg:items-end">
                  <div className="flex flex-wrap gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
                    <span className="rounded-full border border-line/70 bg-white/76 px-3 py-1.5">
                      Scouting dashboard
                    </span>
                    <span className="rounded-full border border-line/70 bg-white/76 px-3 py-1.5">
                      Public Statcast
                    </span>
                  </div>
                  <AppNav />
                </div>
              </div>
            </div>
          </header>
          <main className="mx-auto w-full max-w-[88rem] px-4 pb-16 pt-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
