"use client";

import { useCallback, useState } from "react";
import type { QuizQuestion } from "@/lib/types";
import { useLang } from "./LangProvider";

type Answer = { picked: number; correct: boolean };

export default function Quiz({ questions }: { questions: QuizQuestion[] }) {
  const { t } = useLang();
  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [finished, setFinished] = useState(false);

  const q = questions[idx];

  const pick = useCallback(
    (i: number) => {
      if (picked !== null) return;
      setPicked(i);
      setAnswers((a) => [...a, { picked: i, correct: i === q.answer_index }]);
    },
    [picked, q],
  );

  const next = useCallback(() => {
    if (idx + 1 >= questions.length) {
      setFinished(true);
    } else {
      setIdx((i) => i + 1);
      setPicked(null);
    }
  }, [idx, questions.length]);

  const retry = useCallback(() => {
    setIdx(0);
    setPicked(null);
    setAnswers([]);
    setFinished(false);
  }, []);

  if (questions.length === 0) return null;

  if (finished) {
    const score = answers.filter((a) => a.correct).length;
    const ratio = score / questions.length;
    const messageKey =
      ratio >= 0.8 ? "quizGreat" : ratio >= 0.5 ? "quizOkay" : "quizWeak";
    return (
      <div className="rise mx-auto max-w-2xl">
        <div className="rounded-3xl border border-stone-200 bg-white p-8 text-center">
          <div className="text-4xl">{ratio >= 0.8 ? "🏆" : ratio >= 0.5 ? "👏" : "📚"}</div>
          <p className="mt-3 text-2xl font-extrabold text-stone-900">
            {t("quizScore", { a: score, b: questions.length })}
          </p>
          <p className="mt-1 text-sm text-stone-600">{t(messageKey)}</p>
          <button
            onClick={retry}
            className="mt-6 rounded-xl bg-violet-600 px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-700"
          >
            {t("retry")}
          </button>
        </div>

        <h3 className="mb-3 mt-8 text-sm font-bold uppercase tracking-wide text-stone-500">
          {t("reviewAnswers")}
        </h3>
        <div className="space-y-3">
          {questions.map((question, i) => {
            const a = answers[i];
            return (
              <div
                key={i}
                className={`rounded-2xl border bg-white p-4 ${
                  a?.correct ? "border-emerald-200" : "border-red-200"
                }`}
              >
                <p className="text-sm font-semibold text-stone-900">
                  {a?.correct ? "✓" : "✗"} {question.question}
                </p>
                {!a?.correct && (
                  <p className="mt-1.5 text-xs text-red-600">
                    {t("yourAnswer")}: {question.options[a?.picked ?? -1] ?? "—"}
                  </p>
                )}
                <p className="mt-1 text-xs text-emerald-700">
                  {t("correctAnswer")}: {question.options[question.answer_index]}
                </p>
                {question.explanation && (
                  <p className="mt-1.5 text-xs leading-relaxed text-stone-500">
                    {question.explanation}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const answered = picked !== null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between text-xs font-semibold text-stone-500">
        <span>{t("quizQuestion", { i: idx + 1, n: questions.length })}</span>
        <span>
          {answers.filter((a) => a.correct).length} ✓
        </span>
      </div>

      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-stone-200">
        <div
          className="h-full rounded-full bg-violet-600 transition-all duration-300"
          style={{ width: `${(idx / questions.length) * 100}%` }}
        />
      </div>

      <div key={idx} className="rise rounded-3xl border border-stone-200 bg-white p-6 sm:p-7">
        <p className="text-lg font-bold leading-snug text-stone-900">{q.question}</p>
        <div className="mt-5 space-y-2.5">
          {q.options.map((opt, i) => {
            const isPicked = picked === i;
            const isAnswer = i === q.answer_index;
            let cls =
              "border-stone-200 bg-white hover:border-violet-400 hover:bg-violet-50/50 text-stone-800";
            if (answered) {
              if (isAnswer) {
                cls = "border-emerald-400 bg-emerald-50 text-emerald-900";
              } else if (isPicked) {
                cls = "border-red-300 bg-red-50 text-red-800";
              } else {
                cls = "border-stone-200 bg-white text-stone-400";
              }
            }
            return (
              <button
                key={i}
                onClick={() => pick(i)}
                disabled={answered}
                className={`flex w-full items-start gap-3 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-all ${cls} ${
                  answered ? "cursor-default" : "active:scale-[0.99]"
                }`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-bold opacity-70">
                  {String.fromCharCode(65 + i)}
                </span>
                <span>{opt}</span>
                {answered && isAnswer && <span className="ml-auto">✓</span>}
                {answered && isPicked && !isAnswer && <span className="ml-auto">✗</span>}
              </button>
            );
          })}
        </div>

        {answered && (
          <div className="rise mt-5 rounded-xl bg-stone-50 p-4">
            <p
              className={`text-sm font-bold ${
                picked === q.answer_index ? "text-emerald-700" : "text-red-700"
              }`}
            >
              {picked === q.answer_index ? t("correct") : t("wrong")}
            </p>
            {q.explanation && (
              <p className="mt-1 text-sm leading-relaxed text-stone-600">
                {q.explanation}
              </p>
            )}
            <button
              onClick={next}
              className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-violet-700"
            >
              {idx + 1 >= questions.length ? t("seeResult") : t("next")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
