import type { Metadata } from "next";
import { Newsreader, Space_Grotesk } from "next/font/google";

import { AppNav } from "@/components/app-nav";
import { BaseballLogo } from "@/components/icons/baseball-logo";
import { IntroHelp } from "@/components/intro-help";
import { LoadingLink } from "@/components/ui/loading-link";
import { LoadingProvider } from "@/components/ui/loading-provider";
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
        <LoadingProvider>
          <div className="relative min-h-screen overflow-x-hidden">
            <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_right,rgba(200,148,106,0.08),transparent_30%),radial-gradient(circle_at_top_left,rgba(162,95,73,0.06),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.14),transparent)]" />
            <header className="sticky top-0 z-40 border-b border-line/50 bg-[color:var(--nav-surface)] backdrop-blur-xl">
              <div className="mx-auto max-w-[88rem] px-4 py-3 sm:px-6 lg:px-8">
                <div className="shell-panel flex flex-col gap-4 rounded-[1.35rem] px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-4">
                    <LoadingLink
                      href="/"
                      className="flex items-center gap-4"
                      loadingMessage="Loading catcher intelligence..."
                      loadingSubtitle="Opening the main scouting dashboard."
                    >
                      <span className="brand-mark relative flex h-11 w-11 items-center justify-center rounded-[0.95rem] border border-accent/26 bg-surface-strong text-white shadow-[0_12px_22px_rgba(68,83,95,0.18)]">
                        <BaseballLogo className="h-8 w-8" />
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
                    </LoadingLink>
                  </div>
                  <div className="flex flex-col gap-3 lg:items-end">
                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      <div className="flex flex-wrap gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-muted">
                        <span className="pill-sage rounded-full px-3 py-1.5">
                          Scouting dashboard
                        </span>
                        <span className="pill-sand rounded-full px-3 py-1.5">
                          Public Statcast
                        </span>
                      </div>
                      <IntroHelp />
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
        </LoadingProvider>
      </body>
    </html>
  );
}
