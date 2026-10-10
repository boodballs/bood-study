// Cloudflare Turnstile (free CAPTCHA alternative) — armed only when
// TURNSTILE_SECRET_KEY is set. Without it, checks pass so local dev and the
// pre-Turnstile deployment keep working. Create a widget at
// https://dash.cloudflare.com -> Turnstile, then set:
//   TURNSTILE_SECRET_KEY (server) + NEXT_PUBLIC_TURNSTILE_SITE_KEY (client)

const VERIFY_ENDPOINT = "https://api.cloudflare.com/client/v4/turnstile/siteverify";

export function turnstileEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

export async function verifyTurnstile(
  token: string | null | undefined,
  ip: string,
): Promise<boolean> {
  if (!turnstileEnabled()) return true;
  if (!token) return false;
  try {
    const res = await fetch(VERIFY_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: process.env.TURNSTILE_SECRET_KEY,
        response: token,
        remoteip: ip,
      }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
