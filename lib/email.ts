const RESEND_ENDPOINT = "https://api.resend.com/emails";

const FROM = process.env.EMAIL_FROM || "Bood Study <study@boodautomates.com>";

export type EmailLang = "hu" | "en";

export function appOrigin(request?: Request): string {
  // Emails must always link to the canonical public URL — the Host header
  // behind the cloudflared tunnel is rewritten to localhost:3003.
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (envUrl && /^https?:\/\//.test(envUrl)) {
    return envUrl.replace(/\/+$/, "");
  }
  if (request) {
    const host =
      request.headers.get("x-forwarded-host") ?? request.headers.get("host");
    if (host) {
      const proto =
        request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
        (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
      return `${proto}://${host}`;
    }
    try {
      return new URL(request.url).origin;
    } catch {
      /* fall through */
    }
  }
  return "https://study.boodautomates.com";
}

async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("[email] RESEND_API_KEY not set — cannot send", subject);
    return false;
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM, to, subject, html }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] Resend ${res.status} for ${subject}: ${body.slice(0, 300)}`);
      return false;
    }
    const data = (await res.json()) as { id?: string };
    console.log(`[email] sent "${subject}" to ${to} (id: ${data.id ?? "?"})`);
    return true;
  } catch (err) {
    console.error("[email] send failed:", err);
    return false;
  }
}

type Copy = {
  subject: string;
  title: string;
  body: string;
  cta: string;
  note: string;
  fallback: string;
  footer: string;
};

const VERIFY_COPY: Record<EmailLang, Copy> = {
  hu: {
    subject: "Erősítsd meg az emailed — Bood Study",
    title: "Már csak egy kattintás",
    body: "Köszönöm, hogy regisztráltál a Bood Studyba! Erősítsd meg az email címedet, és máris elérheted a tanulócsomagjaidat bármelyik eszközről.",
    cta: "Email megerősítése",
    note: "A link 24 óráig él.",
    fallback: "Ha a gomb nem működik, másold be ezt a linket a böngészőbe:",
    footer: "Automatikus üzenet — ha nem te kezdeményezted, nyugodtan hagyd figyelmen kívül.",
  },
  en: {
    subject: "Verify your email — Bood Study",
    title: "One click away",
    body: "Thanks for signing up for Bood Study! Confirm your email address and your study sets will be available from any device.",
    cta: "Verify email",
    note: "The link is valid for 24 hours.",
    fallback: "If the button doesn't work, copy this link into your browser:",
    footer: "This is an automated message — if you didn't request it, feel free to ignore it.",
  },
};

const RESET_COPY: Record<EmailLang, Copy> = {
  hu: {
    subject: "Jelszó visszaállítása — Bood Study",
    title: "Jelszó visszaállítása",
    body: "A jelszavad visszaállításához kattints az alábbi gombra, és állíts be egy új jelszót.",
    cta: "Új jelszó beállítása",
    note: "A link 1 óráig él, és csak egyszer használható. Ha nem te kérted a visszaállítást, hagyd figyelmen kívül — a jelszavad változatlan marad.",
    fallback: "Ha a gomb nem működik, másold be ezt a linket a böngészőbe:",
    footer: "Automatikus üzenet — ha nem te kezdeményezted, nyugodtan hagyd figyelmen kívül.",
  },
  en: {
    subject: "Reset your password — Bood Study",
    title: "Reset your password",
    body: "Click the button below to set a new password for your Bood Study account.",
    cta: "Set a new password",
    note: "The link is valid for 1 hour and can be used once. If you didn't request a reset, ignore this email — your password stays unchanged.",
    fallback: "If the button doesn't work, copy this link into your browser:",
    footer: "This is an automated message — if you didn't request it, feel free to ignore it.",
  },
};

function shell(copy: Copy, url: string): string {
  return `<!doctype html>
<html lang="hu">
<body style="margin:0;padding:0;background:#f4f2fc;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f2fc;">
<tr><td align="center" style="padding:40px 16px;">
<table role="presentation" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td style="background:#7c3aed;padding:24px 40px;">
    <span style="color:#ffffff;font-size:20px;font-weight:800;letter-spacing:-0.3px;">Bood <span style="color:#ddd6fe;">Study</span></span>
  </td></tr>
  <tr><td style="padding:36px 40px 8px;">
    <h1 style="margin:0 0 14px;font-size:22px;line-height:1.3;color:#1c1917;">${copy.title}</h1>
    <p style="margin:0 0 26px;font-size:15px;line-height:1.65;color:#57534e;">${copy.body}</p>
    <a href="${url}" style="display:inline-block;background:#7c3aed;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;padding:14px 34px;border-radius:12px;">${copy.cta}</a>
    <p style="margin:26px 0 0;font-size:13px;line-height:1.6;color:#78716c;">${copy.note}</p>
    <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#a8a29e;word-break:break-all;">${copy.fallback}<br><a href="${url}" style="color:#7c3aed;">${url}</a></p>
  </td></tr>
  <tr><td style="padding:22px 40px 30px;">
    <div style="border-top:1px solid #eeecf6;padding-top:20px;">
      <p style="margin:0;font-size:12px;line-height:1.7;color:#a8a29e;">${copy.footer}<br>Bood Study · <a href="https://boodautomates.com" style="color:#7c3aed;text-decoration:none;">boodautomates.com</a></p>
    </div>
  </td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function sendVerificationEmail(
  to: string,
  link: string,
  lang: EmailLang = "hu",
): Promise<boolean> {
  const copy = VERIFY_COPY[lang] ?? VERIFY_COPY.hu;
  return sendEmail(to, copy.subject, shell(copy, link));
}

export async function sendResetEmail(
  to: string,
  link: string,
  lang: EmailLang = "hu",
): Promise<boolean> {
  const copy = RESET_COPY[lang] ?? RESET_COPY.hu;
  return sendEmail(to, copy.subject, shell(copy, link));
}
