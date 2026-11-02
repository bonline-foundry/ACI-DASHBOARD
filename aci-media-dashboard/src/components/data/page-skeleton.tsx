/** Shown while a page streams its data, so the layout appears at once (Doherty threshold). */
export function PageSkeleton({ label = "Loading" }: { label?: string }) {
  return (
    <div className="space-y-6" role="status" aria-label={label}>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="h-[118px] animate-pulse rounded-xl border border-border bg-card" />)}
      </div>
      <div className="h-72 animate-pulse rounded-xl border border-border bg-card" />
      <div className="h-48 animate-pulse rounded-xl border border-border bg-card" />
      <span className="sr-only">{label}…</span>
    </div>
  );
}
