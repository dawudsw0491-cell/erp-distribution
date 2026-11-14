
export default function Loading() {
  return (
    <div className="flex min-h-screen bg-slate-100 md:h-screen md:overflow-hidden">
      {/* Sidebar placeholder */}
      <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-5 md:block">
        <div className="mb-10 h-9 w-36 animate-pulse rounded-lg bg-slate-200" />

        <div className="space-y-5">
          {Array.from({ length: 7 }).map((_, index) => (
            <div key={index} className="space-y-3">
              <div className="h-4 w-32 animate-pulse rounded bg-slate-200" />
              <div className="ml-5 h-3 w-40 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </aside>

      {/* Main content placeholder */}
      <main className="min-w-0 flex-1 overflow-auto p-5 md:p-8">
        <div className="mb-8 flex items-center justify-between">
          <div className="h-7 w-48 animate-pulse rounded bg-slate-200" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-slate-200" />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl border border-slate-200 bg-white"
            />
          ))}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="mb-6 h-5 w-40 animate-pulse rounded bg-slate-200" />
          <div className="space-y-4">
            {Array.from({ length: 6 }).map((_, index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded-lg bg-slate-100"
              />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
