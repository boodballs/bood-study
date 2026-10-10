// Primary generation path: the client extracts text in the browser (the file
// never leaves the device) and sends either a whole document or selected
// chapter parts. Same quota/fuse/turnstile checks as the file route.

import { getCurrentUser } from "@/lib/auth";
import { runPartsJob, runSingleJob, type Part } from "@/lib/job-runner";
import { MAX_CHARS } from "@/lib/text";
import {
  bumpDailyCounter,
  createJob,
  getDailyCounter,
  getWeeklyUsage,
  newId,
  weeklyLimitFor,
} from "@/lib/db";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";

export const runtime = "nodejs";

const DAILY_GLOBAL_LIMIT = Number(process.env.DAILY_GLOBAL_LIMIT || 300);
const MAX_PARTS = 3;
const MAX_TOTAL_CHARS = 500_000;

export async function POST(request: Request) {
  const burst = rateLimit(`burst:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!burst.ok) return tooManyRequests(burst.retryAfter);

  const body = (await request.json().catch(() => ({}))) as {
    text?: string;
    parts?: { title?: string; text?: string }[];
    sourceName?: string;
    sourceSize?: number;
    turnstileToken?: string;
  };

  if (turnstileEnabled()) {
    const ok = await verifyTurnstile(body.turnstileToken, clientIp(request));
    if (!ok) return Response.json({ error: "captcha" }, { status: 403 });
  }

  const user = await getCurrentUser();
  const quotaKey = user ? `user:${user.id}` : `ip:${clientIp(request)}`;
  const limit = weeklyLimitFor(user?.plan);
  if (getWeeklyUsage(quotaKey) >= limit) {
    return Response.json({ error: "quota", limit }, { status: 429 });
  }

  const sourceName = (body.sourceName ?? "document").slice(0, 200);
  const sourceSize = Math.max(0, Math.trunc(Number(body.sourceSize) || 0));

  // Multi-chapter: client already picked the chapters.
  if (Array.isArray(body.parts)) {
    const parts: Part[] = body.parts
      .map((p) => ({ title: (p.title ?? "Chapter").slice(0, 120), text: (p.text ?? "").trim() }))
      .filter((p) => p.text.length >= 200)
      .slice(0, MAX_PARTS);
    const total = parts.reduce((n, p) => n + p.text.length, 0);
    if (parts.length === 0 || total > MAX_TOTAL_CHARS) {
      return Response.json({ error: "default" }, { status: 400 });
    }
    if (getDailyCounter("global") + parts.length > DAILY_GLOBAL_LIMIT) {
      return Response.json({ error: "capacity" }, { status: 429 });
    }

    const jobId = newId();
    createJob(
      jobId,
      {
        name: `${sourceName} (${parts.length} chapter${parts.length > 1 ? "s" : ""})`,
        size: sourceSize,
      },
      user?.id ?? null,
    );
    void runPartsJob(jobId, parts, sourceName, sourceSize, quotaKey, user?.id ?? null);
    return Response.json({ jobId });
  }

  // Single document.
  const text = (body.text ?? "").trim();
  if (text.length < 200) {
    return Response.json({ error: "no-text" }, { status: 422 });
  }
  if (text.length > MAX_TOTAL_CHARS) {
    return Response.json({ error: "default" }, { status: 400 });
  }
  if (getDailyCounter("global") >= DAILY_GLOBAL_LIMIT) {
    return Response.json({ error: "capacity" }, { status: 429 });
  }

  const jobId = newId();
  createJob(jobId, { name: sourceName, size: sourceSize }, user?.id ?? null);
  void runSingleJob(jobId, text.slice(0, MAX_CHARS * 4), sourceName, sourceSize, quotaKey, user?.id ?? null);
  return Response.json({ jobId });
}
