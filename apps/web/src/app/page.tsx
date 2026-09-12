import { LiveDashboard } from "@/components/live-dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="space-y-5">
      <section>
        <p className="text-[11px] text-muted">Dashboard&nbsp;&nbsp;›&nbsp;&nbsp;Live</p>
        <div className="mt-3 flex items-center gap-3">
          <span className="h-6 w-1 rounded-sm bg-accent" />
          <h1 className="text-lg font-medium tracking-[0.02em] text-ink">LIVE GAME MODE</h1>
        </div>
        <p className="mt-3 text-[11px] leading-5 text-muted">
          Real-time catcher game-calling, matched against batter hot zones from public MLB data.
        </p>
      </section>
      <LiveDashboard />
    </div>
  );
}
