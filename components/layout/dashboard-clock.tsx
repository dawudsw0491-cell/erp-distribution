"use client";

import { useEffect, useState } from "react";
import { CalendarDays, Clock3 } from "lucide-react";

export default function DashboardClock() {
  const [currentTime, setCurrentTime] = useState<Date | null>(null);

  useEffect(() => {
    const updateClock = () => setCurrentTime(new Date());
    updateClock();
    const interval = setInterval(updateClock, 30_000);
    return () => clearInterval(interval);
  }, []);

  const dateText = currentTime
    ? new Intl.DateTimeFormat("id-ID", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Jakarta",
      }).format(currentTime)
    : "--";

  const timeText = currentTime
    ? new Intl.DateTimeFormat("id-ID", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: "Asia/Jakarta",
      }).format(currentTime)
    : "--:--";

  return (
    <div className="flex items-center gap-3 border-r border-slate-200 pr-3 sm:pr-5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-slate-600">
        <CalendarDays size={18} strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-slate-500">{dateText}</p>
        <div className="mt-0.5 flex items-center gap-1.5 text-slate-800">
          <Clock3 size={13} className="text-indigo-600" />
          <time className="text-sm font-bold tabular-nums tracking-normal" aria-label={`Pukul ${timeText} WIB`}>
            {timeText}
          </time>
          <span className="text-[10px] font-semibold text-slate-400">WIB</span>
        </div>
      </div>
    </div>
  );
}
