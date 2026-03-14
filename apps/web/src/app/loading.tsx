export default function Loading() {
  return (
    <div className="space-y-6">
      <section className="card overflow-hidden rounded-[1.6rem] p-5 sm:p-6">
        <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="space-y-4">
            <div className="h-3 w-40 rounded-full bg-surface-quiet" />
            <div className="h-10 w-full max-w-2xl rounded-[1rem] bg-surface-quiet" />
            <div className="h-4 w-full max-w-3xl rounded-full bg-surface-quiet" />
            <div className="h-4 w-full max-w-2xl rounded-full bg-surface-quiet" />
            <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_10rem_auto]">
              <div className="h-12 rounded-[1rem] bg-surface-quiet" />
              <div className="h-12 rounded-[1rem] bg-surface-quiet" />
              <div className="h-12 rounded-[1rem] bg-surface-strong/18" />
            </div>
          </div>
          <div className="panel-dark rounded-[1.55rem] p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="h-24 rounded-[1.2rem] bg-white/8" />
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="card h-36 rounded-[1.15rem] p-4" />
        ))}
      </section>
    </div>
  );
}
