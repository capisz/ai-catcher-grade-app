import { LiveDashboard } from "@/components/live-dashboard";

export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <div className="space-y-5">
      <section className="card relative overflow-hidden rounded-xl p-5 sm:p-6">
        <div className="hero-wash pointer-events-none absolute inset-x-0 top-0 h-24" />
        <div className="relative">
          <div className="label-kicker">Live</div>
          <h1 className="mt-3 max-w-3xl font-serif text-2xl leading-tight text-ink">
            Real-time catcher game-calling, straight from today&apos;s games.
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            Pick a game and a catcher to see how their pitch calls track against each batter&apos;s
            hottest zones — graded live on the 20-80 scale, refreshed every 20 seconds.
          </p>
        </div>
      </section>
      <LiveDashboard />
    </div>
  );
}
