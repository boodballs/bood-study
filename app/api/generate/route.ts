import { getCurrentUser } from "@/lib/auth";
import { extractTextFromFile, MAX_FILE_BYTES } from "@/lib/extract";
import {
  createJob,
  getDailyCounter,
  getWeeklyUsage,
  getJob,
  newId,
  weeklyLimitFor,
} from "@/lib/db";
import { runSingleJob } from "@/lib/job-runner";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const DAILY_GLOBAL_LIMIT = Number(process.env.DAILY_GLOBAL_LIMIT || 300);

export async function POST(request: Request) {
  // Light burst guard on top of the weekly quota (stops parallel spam).
  const burst = rateLimit(`burst:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!burst.ok) return tooManyRequests(burst.retryAfter);

  // Global daily fuse — bounds total API spend even under distributed abuse.
  if (getDailyCounter("global") >= DAILY_GLOBAL_LIMIT) {
    return Response.json({ error: "capacity" }, { status: 429 });
  }

  if (turnstileEnabled()) {
    const form = await request.formData().catch(() => null);
    const ok = await verifyTurnstile(
      form?.get("turnstileToken")?.toString(),
      clientIp(request),
    );
    if (!ok) return Response.json({ error: "captcha" }, { status: 403 });
  }

  const user = await getCurrentUser();
  const quotaKey = user ? `user:${user.id}` : `ip:${clientIp(request)}`;
  const limit = weeklyLimitFor(user?.plan);
  if (getWeeklyUsage(quotaKey) >= limit) {
    return Response.json({ error: "quota", limit }, { status: 429 });
  }

  let file: File;
  try {
    const form = await request.formData();
    const candidate = form.get("file");
    if (!(candidate instanceof File)) {
      return Response.json({ error: "unsupported" }, { status: 400 });
    }
    file = candidate;
  } catch {
    return Response.json({ error: "unsupported" }, { status: 400 });
  }

  if (file.size > MAX_FILE_BYTES) {
    return Response.json({ error: "too-large" }, { status: 413 });
  }

  let text: string;
  let chapters;
  try {
    const extracted = await extractTextFromFile(file);
    text = extracted.text;
    chapters = extracted.chapters;
  } catch (err) {
    const code = err instanceof Error ? err.message : "unsupported";
    if (code === "too-large") {
      return Response.json({ error: "too-large" }, { status: 413 });
    }
    if (code === "unsupported-doc") {
      return Response.json({ error: "unsupported-doc" }, { status: 415 });
    }
    return Response.json({ error: "unsupported" }, { status: 415 });
  }

  if (text.trim().length < 200) {
    return Response.json({ error: "no-text" }, { status: 422 });
  }

  // Big book with detected chapters: hand the choice to the student instead
  // of silently studying only the first pages.
  if (chapters && chapters.length >= 2) {
    const { mkdirSync, writeFileSync } = await import("fs");
    const path = await import("path");
    const uploadsDir = path.join(process.cwd(), "data", "uploads");
    mkdirSync(uploadsDir, { recursive: true });
    const documentId = newId();
    writeFileSync(
      path.join(uploadsDir, `${documentId}.txt`),
      text,
    );
    writeFileSync(
      path.join(uploadsDir, `${documentId}.json`),
      JSON.stringify({
        sourceName: file.name,
        sourceSize: file.size,
        userId: user?.id ?? null,
        quotaKey,
        chapters,
      }),
    );
    return Response.json({
      needsSelection: true,
      documentId,
      sourceName: file.name,
      chapters: chapters.map((c) => ({
        index: c.index,
        title: c.title,
        chars: c.end - c.start,
      })),
    });
  }

  const jobId = newId();
  createJob(jobId, { name: file.name, size: file.size }, user?.id ?? null);
  void runSingleJob(jobId, text, file.name, file.size, quotaKey, user?.id ?? null);
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
