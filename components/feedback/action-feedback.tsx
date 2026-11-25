"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

type Notice = { type: "success" | "error" | "warning"; message: string };

const ERROR_MESSAGES: Record<string, string> = {
  permission_denied: "Aksi gagal: akun ini tidak memiliki hak akses yang diperlukan.",
  approve_failed: "Persetujuan gagal. Periksa status dokumen dan hak akses.",
  approval_failed: "Persetujuan gagal. Periksa status dokumen dan hak akses.",
  reject_failed: "Penolakan gagal. Periksa status dokumen dan alasan penolakan.",
  cancel_failed: "Pembatalan gagal. Periksa status dokumen dan prasyarat transaksi.",
  post_failed: "Posting gagal. Periksa data sumber, stok, dan status dokumen.",
  posting_failed: "Posting gagal. Periksa data sumber, stok, dan status dokumen.",
  post_do_failed: "Posting Delivery Order gagal. Periksa kuantitas, stok, dan status pesanan.",
  confirm_failed: "Konfirmasi gagal. Periksa status dan kelengkapan dokumen.",
  save_failed: "Penyimpanan gagal. Database tidak mengonfirmasi perubahan.",
  create_failed: "Pembuatan data gagal. Periksa referensi dan kelengkapan data.",
  load_failed: "Data gagal dimuat. Periksa koneksi lalu muat ulang halaman.",
  invalid_id: "Aksi tidak dijalankan karena identitas dokumen tidak valid.",
  invalid_data: "Aksi tidak dijalankan karena data tidak valid atau belum lengkap.",
  invalid_items: "Aksi tidak dijalankan karena rincian item tidak valid.",
};

const SUCCESS_MESSAGES: Record<string, string> = {
  created: "Data berhasil dibuat dan halaman telah diperbarui.",
  updated: "Perubahan berhasil disimpan dan halaman telah diperbarui.",
  approved: "Transaksi berhasil disetujui dan status terbaru telah dimuat.",
  rejected: "Transaksi berhasil ditolak dan status terbaru telah dimuat.",
  cancelled: "Transaksi berhasil dibatalkan dan status terbaru telah dimuat.",
  posted: "Transaksi berhasil diposting dan data terkait telah diperbarui.",
  receipt_posted: "Penerimaan barang berhasil diposting dan persediaan telah diperbarui.",
  paid: "Pembayaran berhasil dicatat.",
  started: "Proses berhasil dimulai.",
  submitted: "Dokumen berhasil diajukan untuk pemeriksaan.",
  confirmed: "Pesanan berhasil dikonfirmasi.",
  updated_status: "Status berhasil diperbarui.",
  status_updated: "Status berhasil diperbarui.",
  deleted: "Data berhasil dihapus.",
  draft_created: "Draft mutasi berhasil dibuat.",
};

function resolveNotice(search: string): Notice | null {
  const params = new URLSearchParams(search);
  const error = params.get("error");
  if (error) {
    return {
      type: "error",
      message: ERROR_MESSAGES[error] ??
        "Aksi gagal. Periksa status transaksi, kelengkapan data, dan hak akses. Tidak ada status berhasil yang diklaim.",
    };
  }

  for (const key of Object.keys(SUCCESS_MESSAGES)) {
    if (params.get(key) === "1") return { type: "success", message: SUCCESS_MESSAGES[key] };
  }

  const success = params.get("success");
  if (success) {
    return {
      type: "success",
      message: SUCCESS_MESSAGES[success] ??
        "Aksi berhasil diproses. Status terbaru telah dimuat dari server.",
    };
  }

  if (params.has("delivery_order")) return { type: "success", message: "Delivery Order berhasil dibuat." };
  return null;
}

function pendingLabel(submitter: HTMLElement | null): string {
  const raw = submitter?.getAttribute("data-pending-label") ??
    submitter?.textContent ??
    (submitter instanceof HTMLInputElement ? submitter.value : "");
  const label = raw.trim().toLowerCase();

  if (label.includes("approve") || label.includes("setujui")) return "Memvalidasi hak akses dan menyetujui transaksi...";
  if (label.includes("reject") || label.includes("tolak")) return "Memvalidasi status dan memproses penolakan...";
  if (["post", "posting", "terima", "proses"].some((word) => label.includes(word))) return "Memproses transaksi dan memperbarui data terkait...";
  if (label.includes("cancel") || label.includes("batal")) return "Memvalidasi prasyarat dan membatalkan transaksi...";
  return "Menyimpan perubahan dan memvalidasi data...";
}

export default function ActionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const search = searchParams.toString();
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const pendingRef = useRef(false);
  const pendingFormRef = useRef<HTMLFormElement | null>(null);
  const pendingButtonsRef = useRef<Array<HTMLButtonElement | HTMLInputElement>>([]);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const restorePending = useCallback(() => {
    pendingButtonsRef.current.forEach((button) => {
      button.disabled = false;
      button.removeAttribute("data-action-feedback-disabled");
    });
    pendingButtonsRef.current = [];
    pendingFormRef.current?.removeAttribute("aria-busy");
    pendingFormRef.current = null;
    pendingRef.current = false;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    const nextNotice = resolveNotice(search);
    const hadPending = pendingRef.current;
    restorePending();
    setPendingMessage(null);

    if (nextNotice) {
      setNotice(nextNotice);
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else if (hadPending) {
      setNotice({
        type: "warning",
        message: "Halaman berubah tanpa konfirmasi hasil transaksi. Periksa status dokumen sebelum mengulangi tindakan.",
      });
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    } else {
      setNotice(null);
    }
  }, [pathname, search, restorePending]);

  // Terminal feedback is transient: success/error auto-dismiss without user interaction.
  useEffect(() => {
    if (!notice) return;

    const duration = notice.type === "success" ? 4000 : notice.type === "error" ? 5000 : 7000;
    const timer = window.setTimeout(() => setNotice(null), duration);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement) || form.method.toLowerCase() !== "post" || !event.isTrusted) return;

      if (pendingRef.current) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      const submitter = (event as SubmitEvent).submitter;
      pendingRef.current = true;
      pendingFormRef.current = form;
      setNotice(null);

      // React onSubmit/client validation runs after this capture listener.
      // Wait until event dispatch completes before showing a network-pending
      // indicator. If validation calls preventDefault(), clear pending state
      // immediately and do not display a spinner.
      window.setTimeout(() => {
        if (event.defaultPrevented) {
          restorePending();
          setPendingMessage(null);
          return;
        }

        setPendingMessage(pendingLabel(submitter));
        form.setAttribute("aria-busy", "true");
        window.scrollTo({ top: 0, left: 0, behavior: "auto" });

        const controls = Array.from(
          form.querySelectorAll<HTMLButtonElement | HTMLInputElement>(
            'button[type="submit"], button:not([type]), input[type="submit"]'
          )
        );
        pendingButtonsRef.current = controls.filter((control) => !control.disabled);
        pendingButtonsRef.current.forEach((control) => {
          control.disabled = true;
          control.setAttribute("data-action-feedback-disabled", "true");
        });

        timeoutRef.current = setTimeout(() => {
          setPendingMessage(null);
          setNotice({
            type: "warning",
            message: "Belum ada konfirmasi dari server. Tombol tetap dikunci untuk mencegah transaksi ganda. Periksa status dokumen sebelum memuat ulang.",
          });
        }, 45000);
      }, 0);
    };

    document.addEventListener("submit", handleSubmit, true);
    return () => {
      document.removeEventListener("submit", handleSubmit, true);
      restorePending();
    };
  }, [restorePending]);

  const visible = notice ?? (pendingMessage
    ? { type: "warning" as const, message: pendingMessage }
    : null);
  if (!visible) return null;

  const styles = visible.type === "success"
    ? "border-emerald-200 bg-emerald-50 text-emerald-900"
    : visible.type === "error"
      ? "border-red-200 bg-red-50 text-red-900"
      : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <div className="pointer-events-none fixed inset-x-0 top-3 z-[200] flex justify-center px-3" aria-live={visible.type === "error" ? "assertive" : "polite"}>
      <div role={visible.type === "error" ? "alert" : "status"} className={`pointer-events-auto flex w-full max-w-3xl items-start gap-3 rounded-xl border px-4 py-3 text-sm font-medium shadow-lg ${styles}`}>
        {pendingMessage && !notice ? (
          <span aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent" />
        ) : (
          <span aria-hidden="true" className="mt-0.5 shrink-0 font-bold">{visible.type === "success" ? "✓" : visible.type === "error" ? "!" : "•"}</span>
        )}
        <p className="min-w-0 flex-1">{visible.message}</p>

      </div>
    </div>
  );
}
