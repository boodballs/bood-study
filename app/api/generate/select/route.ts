import { sliceChapters, MAX_CHAPTERS_PER_DECK, type Chapter } from "@/lib/chapters";
import {
  createJob,
  getDailyCounter,
  getWeeklyUsage,
  getJob,
  getUserPlan,
  newId,
  weeklyLimitFor,
} from "@/lib/db";
import { runPartsJob } from "@/lib/job-runner";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const DAILY_GLOBAL_LIMIT = Number(process.env.DAILY_GLOBAL_LIMIT || 300);

export async function POST(request: Request) {
  const burst = rateLimit(`burst:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!burst.ok) return tooManyRequests(burst.retryAfter);

  const body = (await request.json().catch(() => ({}))) as {
    documentId?: string;
    chapters?: number[];
    turnstileToken?: string;
  };

  if (turnstileEnabled()) {
    const ok = await verifyTurnstile(body.turnstileToken, clientIp(request));
    if (!ok) return Response.json({ error: "captcha" }, { status: 403 });
  }

  const documentId = body.documentId ?? "";
  if (!/^[a-f0-9]{10}$/.test(documentId)) {
    return Response.json({ error: "default" }, { status: 400 });
  }

  const { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync, unlinkSync, statSync } =
    await import("fs");
  const path = await import("path");
  const uploadsDir = path.join(process.cwd(), "data", "uploads");
  const txtPath = path.join(uploadsDir, `${documentId}.txt`);
  const metaPath = path.join(uploadsDir, `${documentId}.json`);
  if (!existsSync(txtPath) || !existsSync(metaPath)) {
    return Response.json({ error: "default" }, { status: 404 });
  }

  // Sweep upload leftovers older than 24h.
  try {
    for (const f of readdirSync(uploadsDir)) {
      const p = path.join(uploadsDir, f);
      if (statSync(p).mtimeMs < Date.now() - 24 * 60 * 60 * 1000) unlinkSync(p);
    }
  } catch {
    /* best effort */
  }

  const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as {
    sourceName: string;
    sourceSize: number;
    userId: number | null;
    quotaKey: string;
    chapters: Chapter[];
  };
  const text = readFileSync(txtPath, "utf-8");

  const selected = Array.from(
    new Set(
      (body.chapters ?? [])
        .map((n) => Math.trunc(Number(n)))
        .filter((n) => Number.isInteger(n) && n >= 0 && n < meta.chapters.length),
    ),
  )
    .sort((a, b) => a - b)
    .slice(0, MAX_CHAPTERS_PER_DECK);
  if (selected.length === 0) {
    return Response.json({ error: "default" }, { status: 400 });
  }

  const plan = meta.userId ? getUserPlan(meta.userId) : "free";
  const limit = weeklyLimitFor(plan);
  const quotaKey = meta.quotaKey;
  if (getWeeklyUsage(quotaKey) >= limit) {
    return Response.json({ error: "quota", limit }, { status: 429 });
  }

  // Global daily fuse — a multi-chapter deck burns one unit per AI call.
  if (getDailyCounter("global") + selected.length > DAILY_GLOBAL_LIMIT) {
    return Response.json({ error: "capacity" }, { status: 429 });
  }

  const jobId = newId();
  createJob(
    jobId,
    {
      name: `${meta.sourceName} (${selected.length} chapter${selected.length > 1 ? "s" : ""})`,
      size: meta.sourceSize,
    },
    meta.userId,
  );
  const parts = sliceChapters(text, meta.chapters, selected);
  void runPartsJob(jobId, parts, meta.sourceName, meta.sourceSize, quotaKey, meta.userId);
  // Staged upload files are swept by the 24h cleanup; the job no longer needs them.
  return Response.json({ jobId });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const jobId = url.searchParams.get("job") ?? "";
  if (!jobId) return Response.json({ error: "default" }, { status: 400 });
  const job = getJob(jobId);
  if (!job) return Response.json({ status: "error", error: "default" }, { status: 404 });
  return Response.json({
    status: job.status,
    deckId: job.deck_id,
    title: job.title,
    error: job.error,
    progress: job.progress,
  });
}
