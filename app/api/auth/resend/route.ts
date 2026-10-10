import { findUserByEmail } from "@/lib/db";
import { appOrigin, sendVerificationEmail, type EmailLang } from "@/lib/email";
import { createEmailToken, hasRecentToken } from "@/lib/tokens";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

const VERIFY_TTL = 24 * 60 * 60 * 1000;

export async function POST(request: Request) {
  const limit = rateLimit(`auth:${clientIp(request)}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = (await request.json().catch(() => ({}))) as { email?: string };
  const email = (body.email ?? "").trim().toLowerCase();

  const user = email ? findUserByEmail(email) : null;
  if (!user || user.verified) {
    // Silent for verified/unknown emails — no enumeration, no spam.
    return Response.json({ ok: true });
  }
  if (hasRecentToken(user.id, "verify", 60_000)) {
    return Response.json({ error: "cooldown" }, { status: 429 });
  }

  const token = createEmailToken(user.id, "verify", VERIFY_TTL);
  const link = `${appOrigin(request)}/api/auth/verify?token=${token}`;
  await sendVerificationEmail(email, link, "en");
  return Response.json({ ok: true });
}
