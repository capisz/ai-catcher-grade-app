import type { Metadata, Viewport } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { AppNav } from "@/components/app-nav";
import { BrandMark } from "@/components/brand-mark";
import { IntroHelp } from "@/components/intro-help";
import { LoadingLink } from "@/components/ui/loading-link";
import { LoadingProvider } from "@/components/ui/loading-provider";
import "./globals.css";

const bodyFont = Inter({
  variable: "--font-body",
  subsets: ["latin"],
});

const displayFont = Space_Grotesk({
  variable: "--font-display",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "backstop.ai",
  description: "backstop.ai — live MLB catcher game-calling intelligence from public data.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#eef2f9" },
    { media: "(prefers-color-scheme: dark)", color: "#060a14" },
  ],
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
            <header className="site-header">
              <div className="flex h-14 items-center justify-between px-4 sm:px-6">
                <LoadingLink href="/" loadingMessage="Loading backstop.ai..." loadingSubtitle="Opening the live dashboard.">
                  <BrandMark />
                </LoadingLink>
                <IntroHelp />
              </div>
              <div className="border-t border-white/10 px-3 pb-2 lg:hidden">
                <AppNav />
              </div>
            </header>
            <div className="figma-workspace mx-auto flex w-full max-w-[1440px] lg:min-h-screen lg:pl-[220px]">
              <aside className="fixed inset-y-0 left-0 z-20 hidden w-[220px] flex-col bg-[#111321] px-5 pb-5 pt-7 lg:flex">
                <LoadingLink href="/" loadingMessage="Loading backstop.ai..." loadingSubtitle="Opening the live dashboard.">
                  <BrandMark inverse />
                </LoadingLink>
                <p className="mt-6 text-[10px] font-bold tracking-[0.08em] text-[#969dba]">
                  CATCHER INTELLIGENCE
                </p>
                <div className="mt-5">
                  <AppNav />
                </div>
                <div className="mt-auto space-y-3">
                  <p className="px-3.5 text-sm font-medium text-[#969dba]">Public-data workspace</p>
                  <div className="rounded-[10px] bg-[#5688ff] px-3.5 py-3 text-center text-xs font-bold text-white">
                    Guide
                  </div>
                </div>
              </aside>
              <main className="min-w-0 flex-1 px-4 pb-16 pt-6 sm:px-6 lg:max-w-[940px] lg:px-7 lg:pt-7">
                {children}
              </main>
              <aside className="hidden w-[280px] shrink-0 border-l border-[#303652] bg-[#171a2a] px-5 py-7 lg:block">
                <div className="h-6 w-1 rounded-sm bg-[#5688ff]" />
                <h2 className="mt-2 text-lg font-medium text-[#f7f8ff]">Workspace context</h2>
                <div className="mt-5 rounded-[10px] border border-[#303652] bg-[#202337] p-4">
                  <p className="text-[10px] font-bold tracking-[0.08em] text-[#969dba]">DATA SOURCE</p>
                  <p className="mt-2 text-sm font-medium text-[#f7f8ff]">Public MLB data</p>
                  <p className="mt-2 text-xs leading-5 text-[#969dba]">Live game context, catcher evaluation, and matchup research in one workspace.</p>
                </div>
                <div className="mt-4 rounded-[10px] border border-[#303652] bg-[#202337] p-4">
                  <p className="text-[10px] font-bold tracking-[0.08em] text-[#969dba]">WORKFLOW</p>
                  <ol className="mt-3 space-y-3 text-xs leading-5 text-[#c6cbe0]">
                    <li><span className="mr-2 text-[#5688ff]">01</span>Select a live game</li>
                    <li><span className="mr-2 text-[#5688ff]">02</span>Review catcher context</li>
                    <li><span className="mr-2 text-[#5688ff]">03</span>Compare the next-pitch options</li>
                  </ol>
                </div>
                <p className="mt-5 text-xs leading-5 text-[#969dba]">Grades reflect available public data and update as new game events arrive.</p>
              </aside>
            </div>
          </div>
        </LoadingProvider>
      </body>
    </html>
  );
}
