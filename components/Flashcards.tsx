"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Flashcard } from "@/lib/types";
import { useLang } from "./LangProvider";

function shuffled<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function Flashcards({ cards }: { cards: Flashcard[] }) {
  const { t } = useLang();
  const [order, setOrder] = useState<number[]>(() =>
    shuffled(cards.map((_, i) => i)),
  );
  const [pos, setPos] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState<Set<number>>(new Set());

  const card = cards[order[pos]];
  const finished = pos >= order.length;

  const flip = useCallback(() => setFlipped((f) => !f), []);

  const mark = useCallback(
    (isKnown: boolean) => {
      const original = order[pos];
      setKnown((prev) => {
        const next = new Set(prev);
        if (isKnown) next.add(original);
        else next.delete(original);
        return next;
      });
      setFlipped(false);
      setPos((p) => p + 1);
    },
    [order, pos],
  );

  const move = useCallback(
    (delta: number) => {
      setFlipped(false);
      setPos((p) => Math.min(Math.max(p + delta, 0), order.length));
    },
    [order.length],
  );

  const restart = useCallback(
    (unknownOnly: boolean) => {
      const base = unknownOnly
        ? cards.map((_, i) => i).filter((i) => !known.has(i))
        : cards.map((_, i) => i);
      setOrder(shuffled(base));
      setPos(0);
      setFlipped(false);
      if (!unknownOnly) setKnown(new Set());
    },
    [cards, known],
  );

  const reshuffle = useCallback(() => {
    setOrder(shuffled(cards.map((_, i) => i)));
    setPos(0);
    setFlipped(false);
  }, [cards.length]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished) return;
      if (e.code === "Space" || e.code === "Enter") {
        e.preventDefault();
        flip();
      } else if (e.code === "ArrowRight") move(1);
      else if (e.code === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip, move, finished]);

  const trickyCount = useMemo(
    () => cards.length - known.size,
    [cards.length, known.size],
  );

  if (cards.length === 0) return null;

  if (finished) {
    return (
      <div className="rise mx-auto max-w-md rounded-3xl border border-stone-200 bg-white p-8 text-center">
        <div className="text-4xl">{known.size === cards.length ? "🎉" : "💪"}</div>
        <p className="mt-3 text-sm text-stone-600">
          {t("knownCount", { n: known.size, m: trickyCount })}
        </p>
        <p className="mt-1 font-bold text-stone-900">{t("done")}</p>
        <div className="mt-6 flex flex-col gap-2">
          {trickyCount > 0 && (
            <button
              onClick={() => restart(true)}
              className="rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-700"
            >
              {t("restartUnknown", { n: trickyCount })}
            </button>
          )}
          <button
            onClick={() => restart(false)}
            className="rounded-xl border border-stone-300 bg-white px-5 py-3 text-sm font-semibold text-stone-700 transition-colors hover:border-violet-400 hover:text-violet-700"
          >
            {t("restart")}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-stone-500">
        <span>
          {pos + 1} / {order.length}
        </span>
        <span>
          {t("knownCount", { n: known.size, m: trickyCount })}
        </span>
        <button
          onClick={reshuffle}
          className="flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2.5 py-1 transition-colors hover:border-violet-400 hover:text-violet-700"
        >
          <ShuffleIcon />
          {t("shuffle")}
        </button>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-violet-600 transition-all duration-300"
          style={{ width: `${(pos / order.length) * 100}%` }}
        />
      </div>

      <div className="flip-scene h-72 sm:h-80">
        <div
          className={`flip-inner ${flipped ? "flipped" : ""}`}
          onClick={flip}
          role="button"
          tabIndex={0}
        >
          <div className="flip-face cursor-pointer rounded-3xl border border-stone-200 bg-white p-7 shadow-sm">
            <div className="flex flex-1 items-center justify-center overflow-y-auto text-center">
              <p className="text-lg font-semibold leading-snug text-stone-900 sm:text-xl">
                {card.front}
              </p>
            </div>
            {card.hint && (
              <p className="mt-2 text-center text-xs text-stone-400">💡 {card.hint}</p>
            )}
            <p className="pt-3 text-center text-[11px] uppercase tracking-wide text-stone-400">
              {t("flipHint")}
            </p>
          </div>
          <div className="flip-face flip-back cursor-pointer rounded-3xl border border-violet-200 bg-violet-50 p-7 shadow-sm">
            <div className="flex flex-1 items-center justify-center overflow-y-auto text-center">
              <p className="text-base leading-relaxed text-stone-800 sm:text-lg">
                {card.back}
              </p>
            </div>
            <p className="pt-3 text-center text-[11px] uppercase tracking-wide text-violet-400">
              {t("flipHint")}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <button
          onClick={() => mark(false)}
          className="rounded-2xl border border-amber-300 bg-amber-50 px-5 py-3.5 text-sm font-bold text-amber-800 transition-all hover:bg-amber-100 active:scale-[0.98]"
        >
          ↻ {t("again")}
        </button>
        <button
          onClick={() => mark(true)}
          className="rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-bold text-white transition-all hover:bg-emerald-700 active:scale-[0.98]"
        >
          ✓ {t("gotIt")}
        </button>
      </div>
    </div>
  );
}

function ShuffleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
    </svg>
  );
}
