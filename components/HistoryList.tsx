"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DeckSummary } from "@/lib/db";
import { useLang } from "./LangProvider";

export default function HistoryList({
  decks,
  email,
}: {
  decks: DeckSummary[];
  email: string;
}) {
  const { t } = useLang();
  const router = useRouter();

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/");
    router.refresh();
  }, [router]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-stone-200 bg-[#faf9f6]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-5 py-3">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-500 transition-colors hover:border-violet-400 hover:text-violet-700"
            aria-label={t("newSet")}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          <h1 className="flex-1 truncate text-base font-bold text-stone-900 sm:text-lg">
            {t("historyTitle")}
          </h1>
          <span className="hidden max-w-[180px] truncate text-xs text-stone-400 sm:block">
            {email}
          </span>
          <button
            onClick={logout}
            className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:border-red-300 hover:text-red-700"
          >
            {t("logout")}
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-8">
        {decks.length === 0 ? (
          <div className="rise rounded-3xl border border-stone-200 bg-white p-10 text-center">
            <div className="text-4xl">🗂️</div>
            <p className="mt-3 text-sm text-stone-600">{t("historyEmpty")}</p>
            <Link
              href="/"
              className="mt-5 inline-block rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-700"
            >
              {t("newSet")}
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {decks.map((deck) => (
              <Link
                key={deck.id}
                href={`/s/${deck.id}`}
                className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3.5 transition-colors hover:border-violet-300 hover:bg-violet-50/50"
              >
                <DeckIcon />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-stone-800 group-hover:text-violet-800">
                    {deck.title}
                  </div>
                  <div className="truncate text-xs text-stone-400">
                    {deck.source_name} · {new Date(deck.created_at + "Z").toLocaleString()}
                  </div>
                </div>
                <span className="text-stone-300 transition-colors group-hover:text-violet-500">→</span>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function DeckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-violet-500" fill="currentColor" aria-hidden>
      <rect x="3" y="5" width="13" height="16" rx="2" opacity="0.35" />
      <rect x="8" y="3" width="13" height="16" rx="2" />
    </svg>
  );
}
