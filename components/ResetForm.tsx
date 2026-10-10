"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useLang } from "./LangProvider";

export default function ResetForm({ token }: { token: string }) {
  const { t } = useLang();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      if (password !== confirm) {
        setError("resetMismatch");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/auth/reset", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) {
          setError(data.error === "invalid-token" ? "resetInvalid" : "errWeakPassword");
          setBusy(false);
          return;
        }
        setDone(true);
      } catch {
        setError("errorNetwork");
      }
      setBusy(false);
    },
    [busy, password, confirm, token],
  );

  if (!token || error === "resetInvalid") {
    return (
      <div className="rise mx-auto w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <div className="text-4xl">⏳</div>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{t("resetInvalid")}</p>
        <Link
          href="/forgot"
          className="mt-6 inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-violet-700"
        >
          {t("forgotTitle")}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="rise mx-auto w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <div className="text-4xl">✅</div>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{t("resetDone")}</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl bg-violet-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-violet-700"
        >
          {t("login")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rise mx-auto w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
      <h1 className="text-xl font-extrabold text-stone-900">{t("resetTitle")}</h1>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <div>
          <label htmlFor="confirm" className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">
            {t("resetConfirm")}
          </label>
          <input
            id="confirm"
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {t(error)}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-violet-700 disabled:bg-stone-300"
        >
          {busy ? "…" : t("resetTitle")}
        </button>
      </form>
    </div>
  );
}
