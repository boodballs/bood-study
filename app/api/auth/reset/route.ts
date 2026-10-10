import { deleteSessionsForUser, findUserByEmail, updatePasswordHash } from "@/lib/db";
import { hashPassword } from "@/lib/auth";
import { consumeEmailToken, invalidateTokens } from "@/lib/tokens";
import { clientIp, rateLimit, tooManyRequests } from "@/lib/rate-limit";

export async function POST(request: Request) {
  const limit = rateLimit(`auth:${clientIp(request)}`, 10, 60 * 60 * 1000);
  if (!limit.ok) return tooManyRequests(limit.retryAfter);

  const body = (await request.json().catch(() => ({}))) as {
    token?: string;
    password?: string;
  };
  const password = body.password ?? "";
  if (password.length < 8 || password.length > 200) {
    return Response.json({ error: "weak-password" }, { status: 400 });
  }

  const result = body.token ? consumeEmailToken(body.token, "reset") : null;
  if (!result) {
    return Response.json({ error: "invalid-token" }, { status: 400 });
  }

  updatePasswordHash(result.userId, await hashPassword(password));
  deleteSessionsForUser(result.userId);
  invalidateTokens(result.userId, "reset");
  return Response.json({ ok: true });
}
