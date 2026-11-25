
"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import type { KeyboardEvent } from "react";
import {
  Html5Qrcode,
  Html5QrcodeSupportedFormats,
} from "html5-qrcode";
import {
  Camera,
  CameraOff,
  ScanLine,
  Keyboard,
  X,
} from "lucide-react";

interface UniversalScannerProps {
  onScan: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  commitOnBlur?: boolean;
}

const FORMATS = [
  Html5QrcodeSupportedFormats.QR_CODE,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.DATA_MATRIX,
  Html5QrcodeSupportedFormats.PDF_417,
  Html5QrcodeSupportedFormats.AZTEC,
];

export default function UniversalScanner({
  onScan,
  label = "Universal Scanner",
  placeholder = "Scan atau masukkan IMEI / barcode",
  disabled = false,
  commitOnBlur = false,
}: UniversalScannerProps) {
  const generatedId = useId();
  const scannerId = `hexa-scanner-${generatedId.replace(/:/g, "")}`;

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastValueRef = useRef("");
  const lastTimeRef = useRef(0);

  const [scanning, setScanning] = useState(false);
  const [starting, setStarting] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [cameras, setCameras] = useState<
    { id: string; label: string }[]
  >([]);
  const [cameraId, setCameraId] = useState("");
  const [error, setError] = useState("");

  const emitScan = useCallback(
    (rawValue: string) => {
      const value = rawValue.trim();

      if (!value) return;

      // Mencegah pembacaan berulang dari frame kamera yang sama.
      const now = Date.now();

      if (
        value === lastValueRef.current &&
        now - lastTimeRef.current < 1500
      ) {
        return;
      }

      lastValueRef.current = value;
      lastTimeRef.current = now;

      onScan(value);
      setManualValue("");
    },
    [onScan]
  );

  const stopCamera = useCallback(async () => {
    const scanner = scannerRef.current;

    if (!scanner) {
      setScanning(false);
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }

      scanner.clear();
    } catch (err) {
      console.error("Scanner stop error:", err);
    } finally {
      scannerRef.current = null;
      setScanning(false);
      setStarting(false);
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (disabled || starting || scanning) return;

    setError("");
    setStarting(true);

    try {
      const availableCameras = await Html5Qrcode.getCameras();

      if (!availableCameras.length) {
        throw new Error(
          "Kamera tidak ditemukan pada perangkat ini."
        );
      }

      setCameras(
        availableCameras.map((camera) => ({
          id: camera.id,
          label:
            camera.label ||
            `Kamera ${camera.id.slice(0, 6)}`,
        }))
      );

      const selectedCamera =
        availableCameras.find(
          (camera) => camera.id === cameraId
        ) ||
        availableCameras.find((camera) =>
          /back|rear|environment/i.test(camera.label)
        ) ||
        availableCameras[availableCameras.length - 1];

      const scanner = new Html5Qrcode(scannerId, {
        formatsToSupport: FORMATS,
        verbose: false,
      });

      scannerRef.current = scanner;

      await scanner.start(
        selectedCamera.id,
        {
          fps: 10,
          qrbox: { width: 260, height: 150 },
          aspectRatio: 1.777778,
        },
        (decodedText) => {
          emitScan(decodedText);
        },
        () => {
          // Frame tanpa barcode bukan error aplikasi.
        }
      );

      setCameraId(selectedCamera.id);
      setScanning(true);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Tidak dapat mengaktifkan kamera.";

      setError(message);

      const scanner = scannerRef.current;

      if (scanner) {
        try {
          if (scanner.isScanning) {
            await scanner.stop();
          }
          scanner.clear();
        } catch (stopError) {
          console.error(
            "Scanner cleanup error:",
            stopError
          );
        }
      }

      scannerRef.current = null;
      setScanning(false);
    } finally {
      setStarting(false);
    }
  }, [
    cameraId,
    disabled,
    emitScan,
    scannerId,
    scanning,
    starting,
  ]);

  // Input manual dan USB/Bluetooth keyboard wedge.
  // Enter hanya menjalankan pemindaian, bukan submit form induk.
  const handleManualKeyDown = (
    event: KeyboardEvent<HTMLInputElement>
  ) => {
    if (event.key === "Enter") {
      event.preventDefault();
      event.stopPropagation();

      if (!disabled) {
        emitScan(manualValue);
      }
    }
  };

  const handleManualClick = () => {
    if (disabled) return;
    emitScan(manualValue);
  };

  useEffect(() => {
    return () => {
      const scanner = scannerRef.current;

      if (scanner) {
        if (scanner.isScanning) {
          void scanner.stop().catch(console.error);
        }

        try {
          scanner.clear();
        } catch (err) {
          console.error(
            "Scanner cleanup error:",
            err
          );
        }

        scannerRef.current = null;
      }
    };
  }, []);

  return (
    <section className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-blue-600" />
          <h3 className="font-semibold text-gray-900">
            {label}
          </h3>
        </div>

        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            scanning
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-600"
          }`}
        >
          {scanning ? "Kamera Aktif" : "Siap Scan"}
        </span>
      </div>

      <div
        id={scannerId}
        className="min-h-0 overflow-hidden rounded-lg bg-gray-950"
      />

      <div className="flex flex-wrap gap-2">
        {!scanning ? (
          <button
            type="button"
            onClick={startCamera}
            disabled={disabled || starting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Camera className="h-4 w-4" />
            {starting
              ? "Mengaktifkan..."
              : "Aktifkan Kamera"}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopCamera}
            disabled={disabled}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
          >
            <CameraOff className="h-4 w-4" />
            Hentikan Kamera
          </button>
        )}

        {cameras.length > 1 && !scanning && (
          <select
            value={cameraId}
            onChange={(event) =>
              setCameraId(event.target.value)
            }
            disabled={disabled || starting}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
          >
            <option value="">
              Pilih kamera otomatis
            </option>

            {cameras.map((camera) => (
              <option
                key={camera.id}
                value={camera.id}
              >
                {camera.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {error && (
        <div className="flex items-start justify-between gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700">
          <span>{error}</span>

          <button
            type="button"
            onClick={() => setError("")}
            aria-label="Tutup pesan error"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="border-t border-gray-100 pt-3">
        <div className="mb-2 flex items-center gap-2 text-sm font-medium text-gray-700">
          <Keyboard className="h-4 w-4" />
          Input Manual / USB / Bluetooth Scanner
        </div>

        {/* Bukan form agar tidak terjadi nested form */}
        <div className="flex gap-2">
          <input
            type="text"
            value={manualValue}
            onChange={(event) =>
              setManualValue(event.target.value)
            }
            onKeyDown={handleManualKeyDown}
            onBlur={() => {
              if (commitOnBlur && manualValue.trim()) emitScan(manualValue);
            }}
            placeholder={placeholder}
            disabled={disabled}
            autoComplete="off"
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-gray-100"
          />

          <button
            type="button"
            onClick={handleManualClick}
            disabled={
              disabled || !manualValue.trim()
            }
            className="rounded-lg bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Kirim
          </button>
        </div>

        <p className="mt-2 text-xs text-gray-500">
          Scanner USB/Bluetooth dapat digunakan dengan
          mode keyboard wedge. Tekan Enter setelah kode
          terbaca.
        </p>
      </div>
    </section>
  );
}
