"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { DeckSummary } from "@/lib/db";
import type { Chapter } from "@/lib/chapters";
import { extractFileClient, type ClientExtract } from "@/lib/extract-client";
import { useLang } from "./LangProvider";
import TurnstileBox from "./TurnstileBox";

type RecentItem = { id: string; title: string; ts: number };

type PendingDoc = {
  sourceName: string;
  sourceSize: number;
  chapters: { index: number; title: string; chars: number }[];
} & (
  | { kind: "local"; fullText: string; ranges: Chapter[] }
  | { kind: "server"; documentId: string }
);

const RECENT_KEY = "study.recent";
const ACCEPTED = ".pdf,.docx,.txt,.md,.markdown,.rtf";
const MAX_BYTES = 15 * 1024 * 1024;

function loadRecent(): RecentItem[] {
  try {
    const raw = window.localStorage.getItem(RECENT_KEY);
    const list = raw ? (JSON.parse(raw) as RecentItem[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveRecent(id: string, title: string) {
  const list = loadRecent().filter((r) => r.id !== id);
  list.unshift({ id, title, ts: Date.now() });
  window.localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 12)));
}

export default function Home({
  user,
  serverDecks,
  quota,
}: {
  user: { email: string } | null;
  serverDecks: DeckSummary[];
  quota: { used: number; limit: number };
}) {
  const { t } = useLang();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<{ key: string; vars?: Record<string, string | number> } | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [pendingDoc, setPendingDoc] = useState<PendingDoc | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tsToken, setTsToken] = useState("");
  const [tsReset, setTsReset] = useState(0);
  const [extractProgress, setExtractProgress] = useState<{ done: number; total: number } | null>(null);
  const [jobProgress, setJobProgress] = useState<string | null>(null);

  useEffect(() => setRecent(loadRecent()), []);
  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    // Generation takes 2-4.5 min — advance the status lines on a realistic curve.
    const marks = [0, 8000, 40000, 120000, 240000];
    const timer = setInterval(() => {
      const elapsed = Date.now() - started;
      setStep(Math.max(0, marks.filter((m) => elapsed >= m).length - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [busy]);

  const pickFile = useCallback((f: File | null) => {
    setError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setError({ key: "errorTooLarge" });
      return;
    }
    setFile(f);
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      pickFile(e.dataTransfer.files?.[0] ?? null);
    },
    [pickFile],
  );

  const pollJob = useCallback(
    async (jobId: string, fallbackTitle: string) => {
      for (;;) {
        await new Promise((r) => setTimeout(r, 3000));
        const poll = await fetch(`/api/generate?job=${jobId}`);
        const job = (await poll.json().catch(() => ({}))) as {
          status?: string;
          deckId?: string;
          title?: string;
          error?: string;
          progress?: string | null;
        };
        setJobProgress(job.progress ?? null);
        if (poll.status === 404) {
          setError({ key: "errorDefault" });
          setBusy(false);
          return;
        }
        if (job.status === "done" && job.deckId) {
          saveRecent(job.deckId, job.title || fallbackTitle);
          router.push(`/s/${job.deckId}`);
          return;
        }
        if (job.status === "error") {
          setError({ key: "errorAiFailed" });
          setBusy(false);
          return;
        }
      }
    },
    [router],
  );

  const startTextJob = useCallback(
    async (payload: Record<string, unknown>, fallbackTitle: string) => {
      const res = await fetch("/api/generate/text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, turnstileToken: tsToken }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        error?: string;
        retryAfter?: number;
      };
      if (!res.ok || !data.jobId) {
        const code = data.error || "default";
        setError({
          key: code === "rate-limited" ? "errorRateLimited" : `error${code.charAt(0).toUpperCase()}${code.slice(1)}`,
          vars: code === "rate-limited" ? { m: Math.max(1, Math.ceil((data.retryAfter ?? 60) / 60)) } : undefined,
        });
        setTsReset((n) => n + 1);
        setBusy(false);
        return;
      }
      await pollJob(data.jobId, fallbackTitle);
    },
    [tsToken, pollJob],
  );

  const generate = useCallback(async () => {
    if (!file || busy) return;
    setBusy(true);
    setError(null);
    setJobProgress(null);
    try {
      // 1) Extract locally — the file never leaves the device.
      let extract: ClientExtract | null = null;
      try {
        setExtractProgress(null);
        extract = await extractFileClient(file, (done, total) =>
          setExtractProgress({ done, total }),
        );
      } catch {
        extract = null; // rare — fall back to server-side extraction below
      }

      if (extract) {
        if (extract.text.trim().length < 200) {
          setError({ key: "errorNoText" });
          setBusy(false);
          return;
        }
        if (extract.chapters.length >= 2) {
          setPendingDoc({
            kind: "local",
            sourceName: file.name,
            sourceSize: file.size,
            fullText: extract.text,
            ranges: extract.chapters,
            chapters: extract.chapters.map((c) => ({
              index: c.index,
              title: c.title,
              chars: c.end - c.start,
            })),
          });
          setSelected(new Set());
          setBusy(false);
          return;
        }
        await startTextJob(
          { text: extract.text, sourceName: file.name, sourceSize: file.size },
          file.name,
        );
        return;
      }

      // 2) Fallback: server-side extraction (rare client failures, .docx edge cases).
      const form = new FormData();
      form.append("file", file);
      form.append("turnstileToken", tsToken);
      const res = await fetch("/api/generate", { method: "POST", body: form });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        needsSelection?: boolean;
        documentId?: string;
        sourceName?: string;
        chapters?: { index: number; title: string; chars: number }[];
        error?: string;
        retryAfter?: number;
      };
      if (data.needsSelection && data.documentId && data.chapters) {
        setPendingDoc({
          kind: "server",
          sourceName: data.sourceName || file.name,
          sourceSize: file.size,
          documentId: data.documentId,
          chapters: data.chapters,
        });
        setSelected(new Set());
        setBusy(false);
        return;
      }
      if (!res.ok || !data.jobId) {
        const code = data.error || "default";
        setError({
          key: code === "rate-limited" ? "errorRateLimited" : `error${code.charAt(0).toUpperCase()}${code.slice(1)}`,
          vars: code === "rate-limited" ? { m: Math.max(1, Math.ceil((data.retryAfter ?? 60) / 60)) } : undefined,
        });
        setTsReset((n) => n + 1);
        setBusy(false);
        return;
      }
      await pollJob(data.jobId, file.name);
    } catch {
      setError({ key: "errorNetwork" });
      setBusy(false);
    }
  }, [file, busy, tsToken, pollJob, startTextJob]);

  const generateSelected = useCallback(async () => {
    if (!pendingDoc || selected.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    setJobProgress(null);
    try {
      if (pendingDoc.kind === "local") {
        const parts = Array.from(selected)
          .sort((a, b) => a - b)
          .map((i) => {
            const c = pendingDoc.ranges[i];
            return { title: c.title, text: pendingDoc.fullText.slice(c.start, c.end) };
          });
        await startTextJob(
          { parts, sourceName: pendingDoc.sourceName, sourceSize: pendingDoc.sourceSize },
          pendingDoc.sourceName,
        );
      } else {
        const res = await fetch("/api/generate/select", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            documentId: pendingDoc.documentId,
            chapters: Array.from(selected).sort((a, b) => a - b),
            turnstileToken: tsToken,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          jobId?: string;
          error?: string;
          retryAfter?: number;
        };
        if (!res.ok || !data.jobId) {
          const code = data.error || "default";
          setError({
            key: code === "rate-limited" ? "errorRateLimited" : `error${code.charAt(0).toUpperCase()}${code.slice(1)}`,
            vars: code === "rate-limited" ? { m: Math.max(1, Math.ceil((data.retryAfter ?? 60) / 60)) } : undefined,
          });
          setTsReset((n) => n + 1);
          setBusy(false);
          return;
        }
        await pollJob(data.jobId, pendingDoc.sourceName);
      }
    } catch {
      setError({ key: "errorNetwork" });
      setBusy(false);
    }
  }, [pendingDoc, selected, busy, tsToken, pollJob, startTextJob]);

  const toggleChapter = useCallback((index: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < 3) {
        next.add(index);
      }
      return next;
    });
  }, []);

  const stepKeys = ["stepReading", "stepAnalyzing", "stepCards", "stepQuiz", "stepFinishing"];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-5 pt-6">
        <div className="flex items-center gap-2">
          <LogoMark className="h-8 w-8" />
          <span className="text-lg font-extrabold tracking-tight text-stone-900">
            Bood <span className="text-violet-700">Study</span>
          </span>
        </div>
        <div className="flex items-center gap-2">
          {user ? (
            <>
              <a
                href="/history"
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:border-violet-400 hover:text-violet-700"
              >
                {t("mySets")}
              </a>
              <button
                onClick={async () => {
                  await fetch("/api/auth/logout", { method: "POST" });
                  router.refresh();
                }}
                className="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600 transition-colors hover:border-red-300 hover:text-red-700"
              >
                {t("logout")}
              </button>
            </>
          ) : (
            <a
              href="/login"
              className="rounded-full bg-violet-600 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:bg-violet-700"
            >
              {t("login")}
            </a>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-5 pb-16">
        <section className="rise mt-10 text-center sm:mt-14">
          <h1 className="text-3xl font-extrabold leading-tight tracking-tight text-stone-900 sm:text-4xl">
            {t("dropTitle")}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-stone-600">{t("tagline")}</p>
          <p className="mt-2 text-sm font-semibold text-violet-700">{t("freeWeekly")}</p>
        </section>

        <section className="rise mt-8">
          {pendingDoc ? (
            <div className="rounded-3xl border border-stone-200 bg-white p-6 sm:p-7">
              <h2 className="text-lg font-extrabold text-stone-900">{t("chapterTitle")}</h2>
              <p className="mt-1 text-sm text-stone-500">
                {t("chapterHint", { n: 3 })}
              </p>
              <div className="mt-4 max-h-72 space-y-1.5 overflow-y-auto pr-1">
                {pendingDoc.chapters.map((c) => {
                  const checked = selected.has(c.index);
                  return (
                    <button
                      key={c.index}
                      onClick={() => toggleChapter(c.index)}
                      className={`flex w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors ${
                        checked
                          ? "border-violet-500 bg-violet-50"
                          : "border-stone-200 bg-white hover:border-violet-300"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          checked ? "border-violet-600 bg-violet-600" : "border-stone-300 bg-white"
                        }`}
                      >
                        {checked && (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6L9 17l-5-5" />
                          </svg>
                        )}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">
                        {c.title}
                      </span>
                      <span className="shrink-0 text-xs text-stone-400">
                        ~{Math.round(c.chars / 1800)} p.
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-3 text-xs font-semibold text-stone-500">
                {t("chapterSelected", { n: selected.size, m: 3 })}
              </p>
              {error && (
                <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {t(error.key, error.vars)}
                </div>
              )}
              <div className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto]">
                <button
                  onClick={generateSelected}
                  disabled={selected.size === 0 || busy}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-3.5 text-sm font-bold text-white transition-colors hover:bg-violet-700 disabled:bg-stone-300"
                >
                  {busy ? (
                    <>
                      <Spinner />
                      <span>{t(stepKeys[step])}</span>
                    </>
                  ) : (
                    t("chapterGenerate")
                  )}
                </button>
                <button
                  onClick={() => {
                    setPendingDoc(null);
                    setFile(null);
                    setSelected(new Set());
                    setError(null);
                  }}
                  disabled={busy}
                  className="rounded-2xl border border-stone-300 bg-white px-5 py-3.5 text-sm font-semibold text-stone-600 transition-colors hover:border-violet-400 hover:text-violet-700 disabled:opacity-50"
                >
                  {t("chapterBack")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => !busy && inputRef.current?.click()}
                className={`flex cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-all ${
                  dragOver
                    ? "border-violet-500 bg-violet-50 scale-[1.01]"
                    : "border-stone-300 bg-white hover:border-violet-400 hover:bg-violet-50/40"
                }`}
              >
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
                />
                {file ? (
                  <div className="flex flex-col items-center gap-3">
                    <FileChip name={file.name} size={file.size} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        inputRef.current?.click();
                      }}
                      className="text-sm text-violet-700 underline underline-offset-2 hover:text-violet-900"
                    >
                      {t("changeFile")}
                    </button>
                  </div>
                ) : (
                  <>
                    <UploadIcon />
                    <p className="mt-4 font-semibold text-stone-800">{t("orBrowse")}</p>
                    <p className="mt-1 text-sm text-stone-500">{t("accepted")}</p>
                  </>
                )}
              </div>

              <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-xs text-stone-500">
                <LockIcon />
                {t("privacyNote")}
              </p>

              {error && (
                <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
                  {t(error.key, error.vars)}
                </div>
              )}

              <button
                onClick={generate}
                disabled={!file || busy}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-violet-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-violet-600/20 transition-all hover:bg-violet-700 hover:shadow-violet-600/30 active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:shadow-none"
              >
                {busy ? (
                  <>
                    <Spinner />
                    <span>
                      {extractProgress
                        ? `${t("stepReading")} ${extractProgress.done}/${extractProgress.total}`
                        : jobProgress
                          ? t("chapterProgress", { p: jobProgress })
                          : t(stepKeys[step])}
                    </span>
                  </>
                ) : (
                  <>
                    <SparkIcon />
                    <span>{t("generate")}</span>
                  </>
                )}
              </button>

              <div className="mt-4 flex justify-center">
                <TurnstileBox onToken={setTsToken} resetKey={tsReset} />
              </div>

              <p className="mt-3 text-center text-xs font-semibold text-stone-500">
                {t("quotaHint", { n: quota.used, m: quota.limit })}
              </p>
            </>
          )}
        </section>

        {user && serverDecks.length > 0 ? (
          <section className="mt-12">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
                {t("mySets")}
              </h2>
              <a
                href="/history"
                className="text-xs text-violet-700 underline underline-offset-2 hover:text-violet-900"
              >
                {t("historyTitle")} →
              </a>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {serverDecks.slice(0, 6).map((deck) => (
                <a
                  key={deck.id}
                  href={`/s/${deck.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:border-violet-300 hover:bg-violet-50/50"
                >
                  <DeckIcon />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-stone-800 group-hover:text-violet-800">
                      {deck.title}
                    </div>
                    <div className="text-xs text-stone-400">
                      {new Date(deck.created_at + "Z").toLocaleDateString()}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        ) : recent.length > 0 && (
          <section className="mt-12">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold uppercase tracking-wide text-stone-500">
                {t("recent")}
              </h2>
              <button
                onClick={() => {
                  window.localStorage.removeItem(RECENT_KEY);
                  setRecent([]);
                }}
                className="text-xs text-stone-400 underline underline-offset-2 hover:text-stone-600"
              >
                {t("clearList")}
              </button>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {recent.map((r) => (
                <a
                  key={r.id}
                  href={`/s/${r.id}`}
                  className="group flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-4 py-3 transition-colors hover:border-violet-300 hover:bg-violet-50/50"
                >
                  <DeckIcon />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-stone-800 group-hover:text-violet-800">
                      {r.title}
                    </div>
                    <div className="text-xs text-stone-400">
                      {new Date(r.ts).toLocaleDateString()}
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-stone-200 bg-white/60 py-5">
        <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-1 px-5 text-center text-xs text-stone-500">
          <p>{t("disclaimer")}</p>
          <p>
            {t("poweredBy")} ·{" "}
            <a
              href="https://boodautomates.com"
              className="underline underline-offset-2 hover:text-violet-700"
            >
              boodautomates.com
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect x="3" y="7" width="20" height="24" rx="4" fill="#c4b5fd" transform="rotate(-8 13 19)" />
      <rect x="9" y="4" width="20" height="24" rx="4" fill="#7c3aed" />
      <rect x="14" y="11" width="10" height="2.4" rx="1.2" fill="#fff" />
      <rect x="14" y="16" width="7" height="2.4" rx="1.2" fill="#ddd6fe" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-violet-100">
      <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#6d28d9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
        <path d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
      </svg>
    </div>
  );
}

function LockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 018 0v4" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
      <path d="M12 2l1.8 5.6L19 9.4l-5.2 1.8L12 17l-1.8-5.8L5 9.4l5.2-1.8L12 2zM19 15l.9 2.6 2.6.9-2.6.9L19 22l-.9-2.6-2.6-.9 2.6-.9L19 15z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 animate-spin" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
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

function FileChip({ name, size }: { name: string; size: number }) {
  const kb = size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;
  return (
    <div className="flex items-center gap-3 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3">
      <svg viewBox="0 0 24 24" className="h-6 w-6 text-violet-600" fill="currentColor" aria-hidden>
        <path d="M6 2h8l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4a2 2 0 012-2zm7 1.5V8h4.5L13 3.5z" />
      </svg>
      <div className="text-left">
        <div className="max-w-[240px] truncate text-sm font-semibold text-stone-800">{name}</div>
        <div className="text-xs text-stone-500">{kb}</div>
      </div>
    </div>
  );
}
