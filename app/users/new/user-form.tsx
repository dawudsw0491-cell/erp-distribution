
"use client";

import { useState } from "react";
import { createUser } from "@/app/users/actions";

type Role = {
  id: string;
  role_code: string;
  role_name: string;
};

type UserFormProps = {
  roles: Role[];
};

type CreatedUser = {
  userCode: string;
  initialPin: string;
};

export default function UserForm({ roles }: UserFormProps) {
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [phone, setPhone] = useState("");
  const [roleId, setRoleId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<CreatedUser | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setResult(null);
    setLoading(true);

    try {
      const response = await createUser({
        fullName: fullName.trim(),
        username: username.trim().toLowerCase(),
        phone: phone.trim(),
        roleId,
      });

      if (
        !response.success ||
        typeof response.userCode !== "string" ||
        typeof response.initialPin !== "string"
      ) {
        const message =
          "message" in response && typeof response.message === "string"
            ? response.message
            : "Gagal membuat akun pengguna.";

        setError(message);
        return;
      }

      setResult({
        userCode: response.userCode,
        initialPin: response.initialPin,
      });

      setFullName("");
      setUsername("");
      setPhone("");
      setRoleId("");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Terjadi kesalahan saat membuat akun."
      );
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="space-y-5 rounded-lg border border-green-300 bg-green-50 p-6">
        <h2 className="text-lg font-bold text-green-800">
          Akun Berhasil Dibuat
        </h2>

        <p className="text-sm text-green-800">
          Simpan User ID dan PIN berikut. PIN awal hanya ditampilkan
          pada proses pembuatan akun ini.
        </p>

        <div className="space-y-3 rounded-md bg-white p-4">
          <div>
            <p className="text-xs text-gray-500">User ID</p>
            <p className="text-xl font-bold">{result.userCode}</p>
          </div>

          <div>
            <p className="text-xs text-gray-500">PIN Awal</p>
            <p className="text-2xl font-bold tracking-widest">
              {result.initialPin}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setResult(null)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white"
        >
          Buat Akun Berikutnya
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 rounded-lg border p-6">
      {error && (
        <div className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="fullName" className="block text-sm font-medium">
          Nama Lengkap *
        </label>
        <input
          id="fullName"
          type="text"
          required
          maxLength={100}
          value={fullName}
          onChange={(event) => setFullName(event.target.value)}
          className="w-full rounded-md border px-3 py-2"
          placeholder="Masukkan nama lengkap"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="username" className="block text-sm font-medium">
          Username *
        </label>
        <input
          id="username"
          type="text"
          required
          minLength={3}
          maxLength={30}
          pattern="[a-zA-Z0-9_-]{3,30}"
          value={username}
          onChange={(event) =>
            setUsername(event.target.value.toLowerCase())
          }
          className="w-full rounded-md border px-3 py-2"
          placeholder="Contoh: budi01"
        />
        <p className="text-xs text-gray-500">
          Gunakan 3–30 karakter: huruf, angka, underscore, atau strip.
        </p>
      </div>

      <div className="space-y-2">
        <label htmlFor="phone" className="block text-sm font-medium">
          Nomor Telepon
        </label>
        <input
          id="phone"
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          className="w-full rounded-md border px-3 py-2"
          placeholder="Contoh: 081234567890"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="roleId" className="block text-sm font-medium">
          Role Pengguna *
        </label>
        <select
          id="roleId"
          required
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          className="w-full rounded-md border px-3 py-2"
        >
          <option value="">Pilih role</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.role_name}
            </option>
          ))}
        </select>
      </div>

      <div className="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
        Sistem akan membuat User ID dan PIN awal 4 digit secara otomatis.
        Pengguna wajib mengganti PIN saat login pertama.
      </div>

      <button
        type="submit"
        disabled={loading || !roles.length}
        className="w-full rounded-md bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Membuat Akun..." : "Buat Akun Pengguna"}
      </button>
    </form>
  );
}
