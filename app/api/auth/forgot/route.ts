import { findUserByEmail } from "@/lib/db";
import { appOrigin, sendResetEmail, type EmailLang } from "@/lib/email";
import { createEmailToken, hasRecentToken } from "@/lib/tokens";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const RESET_TTL = 60 * 60 * 1000;

export async function POST(request: Request) {
  const limit = rateLimit(`auth:${clientIp(request)}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  // Always answer the same way — no user enumeration.
  const ok = () => Response.json({ ok: true });

  const user = email ? findUserByEmail(email) : null;
  if (!user || !user.verified) return ok();
  if (hasRecentToken(user.id, "reset", 60_000)) return ok();

  const token = createEmailToken(user.id, "reset", RESET_TTL);
  const link = `${appOrigin(request)}/reset?token=${token}`;
  await sendResetEmail(email, link, "en");
  return ok();
}
