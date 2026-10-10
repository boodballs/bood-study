import { createHash, randomBytes } from "crypto";
import { db } from "./db";

const hashToken = (raw: string): string =>
  createHash("sha256").update(raw).digest("hex");

export type TokenKind = "verify" | "reset";

export function createEmailToken(
  userId: number,
  kind: TokenKind,
  ttlMs: number,
): string {
  const raw = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + ttlMs).toISOString();
  db.prepare(
    "INSERT INTO email_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)",
  ).run(hashToken(raw), userId, kind, expires);
  return raw;
}

export function consumeEmailToken(
  raw: string,
  kind: TokenKind,
): { userId: number } | null {
  const row = db
    .prepare(
      "SELECT user_id, expires_at, used_at FROM email_tokens WHERE token_hash = ? AND kind = ?",
    )
    .get(hashToken(raw), kind) as
    | { user_id: number; expires_at: string; used_at: string | null }
    | undefined;
  if (!row || row.used_at) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  db.prepare("UPDATE email_tokens SET used_at = datetime('now') WHERE token_hash = ?").run(
    hashToken(raw),
  );
  return { userId: row.user_id };
}

export function hasRecentToken(userId: number, kind: TokenKind, withinMs: number): boolean {
  const row = db
    .prepare(
      `SELECT created_at FROM email_tokens
       WHERE user_id = ? AND kind = ? AND created_at > datetime('now', ?)`,
    )
    .get(userId, kind, `-${Math.round(withinMs / 1000)} seconds`) as
    | { created_at: string }
    | undefined;
  return Boolean(row);
}

export function invalidateTokens(userId: number, kind: TokenKind): void {
  db.prepare("DELETE FROM email_tokens WHERE user_id = ? AND kind = ?").run(userId, kind);
}
