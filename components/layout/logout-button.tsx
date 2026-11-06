
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function LogoutButton() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  async function handleLogout() {
    setIsLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();

      const { error } = await supabase.auth.signOut();

      if (error) {
        setErrorMessage("Logout gagal. Silakan coba kembali.");
        setIsLoading(false);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch {
      setErrorMessage("Terjadi kesalahan saat logout.");
      setIsLoading(false);
    }
  }

  return (
    <div className="border-t border-slate-800 p-4">
      {errorMessage && (
        <p
          role="alert"
          className="mb-3 rounded-lg bg-red-950 px-3 py-2 text-xs text-red-300"
        >
          {errorMessage}
        </p>
      )}

      <button
        type="button"
        onClick={handleLogout}
        disabled={isLoading}
        className="flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium text-red-300 transition hover:bg-red-950 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className="text-lg">↪</span>

        {isLoading ? "Sedang Logout..." : "Logout"}
      </button>
    </div>
  );
}
