import type { Metadata } from "next";
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
              <div className="mx-auto flex h-14 max-w-[88rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
                <LoadingLink
                  href="/"
                  loadingMessage="Loading backstop.ai..."
                  loadingSubtitle="Opening the live dashboard."
                >
                  <BrandMark />
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
