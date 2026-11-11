
"use client";

import { useEffect, useState } from "react";

export default function DashboardClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => {
      setCurrentTime(new Date());
    };

    updateClock();

    const interval = setInterval(updateClock, 1000);

    return () => clearInterval(interval);
  }, []);

  const dateText = currentTime
    ? new Intl.DateTimeFormat("id-ID", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(currentTime)
    : "Memuat tanggal...";

  const timeText = currentTime
    ? new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
      }).format(currentTime)
    : "--:--:--";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-blue-100 bg-gradient-to-br from-white to-sky-50 px-4 py-2 shadow-[0_4px_12px_rgba(37,99,235,0.08)]">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100/80 text-blue-600">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </div>

      <div className="min-w-0">
        <p className="text-xs font-medium capitalize text-slate-500">
          {dateText}
        </p>

        <p
          className="font-mono text-lg font-bold tracking-wider tabular-nums text-blue-700"
          aria-label={`Jam ${timeText}`}
        >
          {timeText}
        </p>
      </div>
    </div>
  );
}
