import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";

import { AppNav } from "@/components/app-nav";
import { BaseballLogo } from "@/components/icons/baseball-logo";
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
            <header className="sticky top-0 z-40 border-b border-line bg-[color:var(--nav-surface)] backdrop-blur-xl">
              <div className="mx-auto flex h-14 max-w-[88rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                <LoadingLink
                  href="/"
                  className="flex items-center gap-2.5"
                  loadingMessage="Loading catcher intelligence..."
                  loadingSubtitle="Opening the main scouting dashboard."
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white">
                    <BaseballLogo className="h-5 w-5" />
                  </span>
                  <span className="font-serif text-[1.05rem] font-semibold tracking-tight text-ink">
                    Catcher Intel
                  </span>
                </LoadingLink>
                <div className="flex items-center gap-2">
                  <AppNav />
                  <IntroHelp />
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
