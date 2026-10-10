"use client";

import Link from "next/link";
import { useLang } from "./LangProvider";

export default function Verified() {
  const { t } = useLang();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-5">
      <div className="rise w-full max-w-sm rounded-3xl border border-stone-200 bg-white p-10 text-center shadow-sm">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h1 className="mt-5 text-2xl font-extrabold text-stone-900">{t("verifiedTitle")}</h1>
        <p className="mt-3 text-sm leading-relaxed text-stone-600">{t("verifiedText")}</p>
        <Link
          href="/login"
          className="mt-7 block rounded-xl bg-violet-600 px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-violet-700"
        >
          {t("verifiedCta")}
        </Link>
      </div>
    </div>
  );
}
