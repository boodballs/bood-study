"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import type { DeckRecord } from "@/lib/types";
import { useLang } from "./LangProvider";
import Markdown from "./Markdown";
import Flashcards from "./Flashcards";
import Quiz from "./Quiz";

type Tab = "summary" | "cards" | "guide" | "quiz";

export default function Viewer({ deck }: { deck: DeckRecord }) {
  const { t } = useLang();
  const [tab, setTab] = useState<Tab>("summary");
  const [copied, setCopied] = useState(false);

  const share = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable */
    }
  }, []);

  const tabs: { key: Tab; label: string; badge?: number }[] = [
    { key: "summary", label: t("tabSummary") },
    { key: "cards", label: t("tabCards"), badge: deck.flashcards.length },
    { key: "guide", label: t("tabGuide") },
    { key: "quiz", label: t("tabQuiz"), badge: deck.quiz.length },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-[#faf9f6]/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-4xl items-center gap-3 px-5 py-3">
          <Link
            href="/"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-stone-300 bg-white text-stone-500 transition-colors hover:border-violet-400 hover:text-violet-700"
            aria-label={t("newSet")}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-bold text-stone-900 sm:text-lg">
              {deck.title}
            </h1>
            {deck.source_name && (
              <p className="truncate text-xs text-stone-400">{deck.source_name}</p>
            )}
          </div>
          <button
            onClick={share}
            className="flex items-center gap-1.5 rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:border-violet-400 hover:text-violet-700"
            aria-label={t("share")}
          >
            {copied ? <CheckIcon /> : <LinkIcon />}
            <span className="hidden sm:inline">{copied ? t("copied") : t("share")}</span>
          </button>
        </div>

        <div className="mx-auto w-full max-w-4xl overflow-x-auto px-5">
          <nav className="flex gap-1 pb-0">
            {tabs.map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key)}
                className={`flex items-center gap-1.5 whitespace-nowrap rounded-t-lg border-b-2 px-3.5 py-2 text-sm font-semibold transition-colors ${
                  tab === item.key
                    ? "border-violet-600 text-violet-800"
                    : "border-transparent text-stone-500 hover:text-stone-800"
                }`}
              >
                {item.label}
                {item.badge !== undefined && (
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                      tab === item.key
                        ? "bg-violet-100 text-violet-700"
                        : "bg-stone-200 text-stone-500"
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <div key={tab} className="rise">
          {tab === "summary" && <Markdown md={deck.summary_md} />}
          {tab === "cards" && <Flashcards cards={deck.flashcards} />}
          {tab === "guide" && <GuideView deck={deck} />}
          {tab === "quiz" && <Quiz questions={deck.quiz} />}
        </div>
      </main>

      <footer className="border-t border-stone-200 bg-white/60 py-4">
        <p className="mx-auto max-w-4xl px-5 text-center text-xs text-stone-500">
          {t("disclaimer")}
        </p>
      </footer>
    </div>
  );
}

function GuideView({ deck }: { deck: DeckRecord }) {
  const { t } = useLang();
  if (deck.key_terms.length === 0) return <Markdown md={deck.study_guide_md} />;
  return (
    <div>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-stone-500">
        {t("keyTerms")}
      </h2>
      <div className="mb-8 grid gap-2 sm:grid-cols-2">
        {deck.key_terms.map((term, i) => (
          <div
            key={i}
            className="rounded-xl border border-stone-200 bg-white px-4 py-3"
          >
            <div className="text-sm font-bold text-violet-800">{term.term}</div>
            <div className="mt-0.5 text-sm text-stone-600">{term.definition}</div>
          </div>
        ))}
      </div>
      <Markdown md={deck.study_guide_md} />
    </div>
  );
}

function LinkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7l1.7-1.7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}
