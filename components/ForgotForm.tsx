"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useLang } from "./LangProvider";

export default function ForgotForm() {
  const { t } = useLang();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      try {
        await fetch("/api/auth/forgot", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });
      } catch {
        /* always show the sent state — no enumeration */
      }
      setSent(true);
      setBusy(false);
    },
    [busy, email],
  );

  if (sent) {
    return (
      <div className="rise mx-auto w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#6d28d9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-stone-600">{t("forgotSent")}</p>
        <Link
          href="/login"
          className="mt-6 inline-block rounded-xl border border-stone-300 bg-white px-5 py-2.5 text-sm font-semibold text-stone-700 transition-colors hover:border-violet-400 hover:text-violet-700"
        >
          {t("forgotBack")}
        </Link>
      </div>
    );
  }

  return (
    <div className="rise mx-auto w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
      <h1 className="text-xl font-extrabold text-stone-900">{t("forgotTitle")}</h1>
      <p className="mt-1 text-sm text-stone-500">{t("forgotSubtitle")}</p>
      <form onSubmit={submit} className="mt-5 space-y-4">
        <div>
          <label htmlFor="email" className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">
            {t("emailLabel")}
          </label>
          <input
            id="email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-violet-700 disabled:bg-stone-300"
        >
          {busy ? "…" : t("forgotTitle")}
        </button>
      </form>
      <Link
        href="/login"
        className="mt-5 block text-center text-sm text-violet-700 underline underline-offset-2 hover:text-violet-900"
      >
        {t("forgotBack")}
      </Link>
    </div>
  );
}
