
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteUser } from "./actions";

type DeleteUserButtonProps = {
  userId: string;
  userCode: string;
  isCurrentUser: boolean;
};

export default function DeleteUserButton({
  userId,
  userCode,
  isCurrentUser,
}: DeleteUserButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState("");

  function handleDelete() {
    if (isCurrentUser) {
      setMessage("Anda tidak dapat menghapus akun sendiri.");
      return;
    }

    const confirmed = window.confirm(
      `PERINGATAN!\n\nApakah Anda yakin ingin menghapus akun ${userCode} secara permanen?\n\nTindakan ini tidak dapat dibatalkan.`
    );

    if (!confirmed) return;

    setMessage("");

    startTransition(async () => {
      const result = await deleteUser(userId);

      setMessage(result.message);

      if (result.success) {
        router.refresh();
      }
    });
  }

  if (isCurrentUser) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={handleDelete}
        disabled={isPending}
        className="rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
      >
        {isPending ? "Menghapus..." : "Hapus"}
      </button>

      {message && (
        <p role="status" className="max-w-48 text-xs text-gray-600">
          {message}
        </p>
      )}
    </div>
  );
}
