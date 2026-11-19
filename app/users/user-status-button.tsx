
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserActive } from "./actions";

type UserStatusButtonProps = {
  userId: string;
  isActive: boolean;
  isCurrentUser: boolean;
};

export default function UserStatusButton({
  userId,
  isActive,
  isCurrentUser,
}: UserStatusButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  const nextStatus = !isActive;

  async function handleClick() {
    const action = nextStatus ? "mengaktifkan" : "menonaktifkan";

    if (isCurrentUser && !nextStatus) {
      setMessage("Anda tidak dapat menonaktifkan akun sendiri.");
      return;
    }

    const confirmed = window.confirm(
      `Apakah Anda yakin ingin ${action} akun ini?`
    );

    if (!confirmed) return;

    setMessage("");

    startTransition(async () => {
      const result = await setUserActive(userId, nextStatus);

      setMessage(result.message);

      if (result.success) {
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={isPending || (isCurrentUser && isActive)}
        className={`rounded-md px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 ${
          isActive
            ? "bg-amber-600 hover:bg-amber-700"
            : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {isPending
          ? "Memproses..."
          : isActive
            ? "Nonaktifkan"
            : "Aktifkan"}
      </button>

      {message && (
        <p
          role="status"
          className="max-w-48 text-xs text-gray-600"
        >
          {message}
        </p>
      )}
    </div>
  );
}
