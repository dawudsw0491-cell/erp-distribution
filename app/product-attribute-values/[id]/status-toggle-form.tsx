
"use client";

import { toggleProductAttributeValueStatus } from "../actions";

type Props = {
  id: string;
  isActive: boolean;
};

export default function StatusToggleForm({ id, isActive }: Props) {
  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    const action = isActive ? "menonaktifkan" : "mengaktifkan";

    const confirmed = window.confirm(
      `Apakah Anda yakin ingin ${action} Attribute Value ini?`
    );

    if (!confirmed) {
      event.preventDefault();
    }
  };

  return (
    <form
      action={toggleProductAttributeValueStatus}
      onSubmit={handleSubmit}
    >
      <input type="hidden" name="id" value={id} />

      <button
        type="submit"
        className={`rounded-lg px-4 py-2 text-sm font-medium text-white ${
          isActive
            ? "bg-red-600 hover:bg-red-700"
            : "bg-green-600 hover:bg-green-700"
        }`}
      >
        {isActive ? "Nonaktifkan" : "Aktifkan"}
      </button>
    </form>
  );
}
