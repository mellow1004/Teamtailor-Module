"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Fel lösenord");
      }
      router.replace("/");
      router.refresh();
    } catch (err: any) {
      setError(err?.message || "Något gick fel");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-200 p-6"
      >
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Logga in</h1>
        <p className="mt-1 mb-6 text-sm text-gray-600">
          Rekryteringsassistenten kräver lösenord.
        </p>

        <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
          Lösenord
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          required
          disabled={submitting}
          className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent disabled:bg-gray-50"
        />

        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting || password.length === 0}
          className="mt-4 w-full px-4 py-2.5 rounded-lg bg-brand-600 hover:bg-brand-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-medium transition"
        >
          {submitting ? "Loggar in…" : "Logga in"}
        </button>
      </form>
    </main>
  );
}
