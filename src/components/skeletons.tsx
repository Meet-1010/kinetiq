export function GridSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading components">
      <div className="mb-7 space-y-3">
        <div className="skeleton h-3 w-24 rounded-full" />
        <div className="skeleton h-11 w-72 rounded-xl" />
        <div className="skeleton h-4 w-96 max-w-full rounded-full" />
      </div>
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="glass rounded-[28px] p-3">
            <div className="skeleton aspect-[16/10] rounded-[20px]" />
            <div className="skeleton mx-3 mb-3 mt-5 h-5 w-1/2 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading component" className="mx-auto max-w-[1480px] px-4 pt-6 sm:px-6 lg:pt-8">
      <div className="skeleton mb-5 h-4 w-64 rounded-full" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8">
        <div className="glass rounded-[28px] p-3">
          <div className="skeleton aspect-video rounded-[20px]" />
        </div>
        <div className="glass h-[460px] rounded-[28px]" />
      </div>
    </div>
  );
}
