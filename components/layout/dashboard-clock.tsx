
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
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(currentTime)
    : "--";

  const timeText = currentTime
    ? new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(currentTime)
    : "--:--:--";

  return (
    <div className="flex items-center gap-2.5 border-r border-slate-200 pr-4">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
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
        <p className="text-[11px] font-medium capitalize text-slate-500">
          {dateText}
        </p>

        <p
          className="font-mono text-sm font-semibold tracking-wide tabular-nums text-slate-800"
          aria-label={`Pukul ${timeText}`}
        >
          {timeText}
        </p>
      </div>
    </div>
  );
}
