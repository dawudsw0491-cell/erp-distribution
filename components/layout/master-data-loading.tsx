type MasterDataLoadingProps = {
  label?: string;
};

export default function MasterDataLoading({
  label = "data",
}: MasterDataLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={`Memuat ${label}`}
      className="flex min-h-[calc(100vh-2rem)] w-full items-center justify-center bg-white px-6"
    >
      <p className="text-center text-sm font-medium text-slate-600">
        Memuat {label}...
      </p>
    </div>
  );
}
