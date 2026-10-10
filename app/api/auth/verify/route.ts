import { markUserVerified } from "@/lib/db";
import { appOrigin } from "@/lib/email";
import { consumeEmailToken } from "@/lib/tokens";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token") ?? "";
  // Redirect to the canonical public URL — request.url's host is rewritten
  // to localhost:3003 behind the cloudflared tunnel.
  const origin = appOrigin(request);

  const result = token ? consumeEmailToken(token, "verify") : null;
  if (!result) {
    return Response.redirect(`${origin}/login?verify=invalid`, 303);
  }

  // No auto-login: the student sees a celebration page and signs in themselves.
  markUserVerified(result.userId);
  return Response.redirect(`${origin}/verified`, 303);
}
