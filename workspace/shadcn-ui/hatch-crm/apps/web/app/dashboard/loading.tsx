export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="h-8 w-72 animate-pulse rounded bg-slate-200" />
        <div className="h-4 w-96 max-w-full animate-pulse rounded bg-slate-100" />
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-xl border border-slate-200 bg-slate-100"
          />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-100" />
          ))}
        </div>
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-4 w-full animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-slate-200" />
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
