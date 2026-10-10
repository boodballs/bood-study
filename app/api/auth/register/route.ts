import {
  createUser,
  findUserByEmail,
  getDailyCounter,
  bumpDailyCounter,
  setUserLang,
  updatePasswordHash,
} from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { appOrigin, sendVerificationEmail, type EmailLang } from "@/lib/email";
import { createEmailToken, hasRecentToken } from "@/lib/tokens";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";
import { turnstileEnabled, verifyTurnstile } from "@/lib/turnstile";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VERIFY_TTL = 24 * 60 * 60 * 1000;
// Cap verification emails per IP per day — stops the register endpoint from
// being abused as a spam relay through Resend.
const MAX_VERIFY_EMAILS_PER_IP_PER_DAY = 6;

export async function POST(request: Request) {
  const limit = rateLimit(`auth:${clientIp(request)}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
    turnstileToken?: string;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const lang = "en"; // English-only for now

  if (turnstileEnabled()) {
    const ok = await verifyTurnstile(body.turnstileToken, clientIp(request));
    if (!ok) return Response.json({ error: "captcha" }, { status: 403 });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return Response.json({ error: "invalid-email" }, { status: 400 });
  }
  if (password.length < 8 || password.length > 200) {
    return Response.json({ error: "weak-password" }, { status: 400 });
  }

  const existing = findUserByEmail(email);
  if (existing && existing.verified) {
    return Response.json({ error: "email-taken" }, { status: 409 });
  }

  const mailKey = `mailip:${clientIp(request)}`;
  if (getDailyCounter(mailKey) >= MAX_VERIFY_EMAILS_PER_IP_PER_DAY) {
    return Response.json({ error: "rate-limited" }, { status: 429 });
  }

  let userId: number;
  if (existing) {
    // Registered but never verified — refresh the password and resend the link.
    if (hasRecentToken(existing.id, "verify", 60_000)) {
      return Response.json({ error: "cooldown" }, { status: 429 });
    }
    userId = existing.id;
    const hash = await hashPassword(password);
    updatePasswordHash(userId, hash);
    setUserLang(userId, lang);
  } else {
    userId = createUser(email, await hashPassword(password), lang);
  }

  const token = createEmailToken(userId, "verify", VERIFY_TTL);
  const link = `${appOrigin(request)}/api/auth/verify?token=${token}`;
  console.log(`[register] verify link origin: ${new URL(link).origin}`);
  const sent = await sendVerificationEmail(email, link, lang as EmailLang);
  if (sent) {
    bumpDailyCounter(mailKey);
  } else {
    console.error(`[register] verification email failed for ${email}`);
  }
  return Response.json({ ok: true, needsVerification: true });
}
