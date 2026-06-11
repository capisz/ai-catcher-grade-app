import { isDemoDataActive } from "@/lib/demo-snapshot";

/**
 * Small floating badge shown when the page was rendered from the build-time
 * demo snapshot instead of the live backend. Render it after the page's data
 * fetches so the per-request demo flag is settled.
 */
export function DemoDataBadge() {
  if (!isDemoDataActive()) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 rounded-full border-2 border-ink bg-surface-strong px-4 py-2 text-[0.62rem] font-bold uppercase tracking-[0.08em] text-black shadow-lg">
      Demo data
    </div>
  );
}
