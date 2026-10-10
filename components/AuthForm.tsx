"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLang } from "./LangProvider";
import TurnstileBox from "./TurnstileBox";

type Mode = "login" | "register";

export default function AuthForm({ verifyNotice }: { verifyNotice?: string }) {
  const { t } = useLang();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [tsToken, setTsToken] = useState("");
  const [tsReset, setTsReset] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(verifyNotice ?? null);
  const [inboxFor, setInboxFor] = useState<string | null>(null);

  const errorKey = (code: string): string => {
    switch (code) {
      case "invalid-email":
        return "errInvalidEmail";
      case "weak-password":
        return "errWeakPassword";
      case "email-taken":
        return "errEmailTaken";
      case "bad-credentials":
        return "errBadCredentials";
      case "cooldown":
        return "errCooldown";
      case "verify-required":
        return "verifyRequired";
      default:
        return "errorDefault";
    }
  };

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (busy) return;
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch(`/api/auth/${mode}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            mode === "register" ? { email, password, turnstileToken: tsToken } : { email, password },
          ),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          needsVerification?: boolean;
        };
        if (!res.ok) {
          setError(errorKey(data.error ?? "default"));
          setTsReset((n) => n + 1);
          setBusy(false);
          return;
        }
        if (data.needsVerification) {
          setInboxFor(email);
          setBusy(false);
          return;
        }
        router.push("/");
        router.refresh();
      } catch {
        setError("errorNetwork");
        setBusy(false);
      }
    },
    [busy, email, password, mode, router],
  );

  const resend = useCallback(async () => {
    if (!email || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok && data.error === "cooldown") {
        setError("errCooldown");
      } else {
        setInboxFor(email);
      }
    } catch {
      setError("errorNetwork");
    }
    setBusy(false);
  }, [email, busy]);

  if (inboxFor) {
    return (
      <div className="rise mx-auto w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#6d28d9" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M3 7l9 6 9-6" />
          </svg>
        </div>
        <h1 className="mt-4 text-xl font-extrabold text-stone-900">{t("checkInboxTitle")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-600">
          {t("checkInboxText", { email: inboxFor })}
        </p>
        <p className="mt-2 text-xs text-stone-400">{t("checkInboxHint")}</p>
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
      <h1 className="text-xl font-extrabold text-stone-900">
        {mode === "login" ? t("loginTitle") : t("registerTitle")}
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        {mode === "login" ? t("loginSubtitle") : t("registerSubtitle")}
      </p>

      {notice && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {t(notice)}
        </div>
      )}

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
        <div>
          <label htmlFor="password" className="mb-1 block text-xs font-bold uppercase tracking-wide text-stone-500">
            {t("passwordLabel")}
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-stone-300 bg-white px-4 py-3 text-sm text-stone-900 outline-none transition-colors focus:border-violet-500 focus:ring-2 focus:ring-violet-100"
          />
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {t(error)}
            {error === "verifyRequired" && (
              <button
                type="button"
                onClick={resend}
                className="mt-2 block text-left font-semibold text-violet-700 underline underline-offset-2 hover:text-violet-900"
              >
                {t("resendVerify")}
              </button>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-violet-700 disabled:bg-stone-300"
        >
          {busy ? "…" : mode === "login" ? t("login") : t("register")}
        </button>

        {mode === "register" && (
          <div className="flex justify-center">
            <TurnstileBox onToken={setTsToken} resetKey={tsReset} />
          </div>
        )}
      </form>

      <div className="mt-5 flex items-center justify-between text-sm">
        <button
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
            setNotice(null);
          }}
          className="text-violet-700 underline underline-offset-2 hover:text-violet-900"
        >
          {mode === "login" ? t("noAccount") : t("haveAccount")}
        </button>
        {mode === "login" && (
          <Link
            href="/forgot"
            className="text-stone-500 underline underline-offset-2 hover:text-stone-700"
          >
            {t("forgotLink")}
          </Link>
        )}
      </div>
    </div>
  );
}
