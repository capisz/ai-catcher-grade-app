"use client";

import { BaseballLogo } from "@/components/icons/baseball-logo";
import { useGlobalLoading } from "@/components/ui/loading-provider";

/**
 * backstop.ai brand lockup. The baseball idles with a slow spin and whips up
 * to a fast spin whenever a route transition is in flight, doubling as a
 * lightweight loading indicator in the header.
 */
export function BrandMark() {
  const { isLoading } = useGlobalLoading();

  return (
    <span className="flex items-center gap-2.5">
      <BaseballLogo
        className={["h-7 w-7 brand-spin", isLoading ? "brand-spin--fast" : ""].join(" ")}
      />
      <span className="font-serif text-[1.15rem] font-bold tracking-tight text-ink">
        backstop<span className="text-accent">.ai</span>
      </span>
    </span>
  );
}
