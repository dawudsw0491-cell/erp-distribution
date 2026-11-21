export default function MasterDataLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Memuat halaman"
      className="flex h-full min-h-[70vh] w-full items-center justify-center bg-slate-100 px-6"
    >
      <div className="w-full max-w-xs">
        <div className="master-data-loader-scene mx-auto w-full max-w-[260px]">
          <div className="master-data-loader-track">
            <div className="master-data-loader-bar" />
          </div>
        </div>
        <p className="mt-5 text-center text-xs font-medium tracking-wide text-slate-500">
          Memuat halaman...
        </p>
      </div>
    </div>
  );
}
