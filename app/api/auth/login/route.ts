import { findUserByEmail } from "@/lib/db";
import { isHttps, startSession, verifyPassword } from "@/lib/auth";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limit = rateLimit(`auth:${clientIp(request)}`, 20, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = (await request.json().catch(() => ({}))) as {
    email?: string;
    password?: string;
  };
  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";

  const user = findUserByEmail(email);
  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return Response.json({ error: "bad-credentials" }, { status: 401 });
  }
  if (!user.verified) {
    return Response.json({ error: "verify-required" }, { status: 403 });
  }

  await startSession(user.id, isHttps(request));
  return Response.json({ email: user.email });
}
