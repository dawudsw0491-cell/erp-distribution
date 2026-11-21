export default function MasterDataLoading() {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label="Memuat data dari database dan server"
      className="flex min-h-[70vh] w-full items-center justify-center bg-slate-100 px-6"
    >
      <p className="text-center text-sm font-medium text-slate-600">
        Memuat data dari database dan server...
      </p>
    </div>
  );
}
