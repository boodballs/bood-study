import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import path from "path";
import type { DeckRecord, StudySet } from "./types";

const dataDir = path.join(process.cwd(), "data");
mkdirSync(dataDir, { recursive: true });

export const db = new Database(path.join(dataDir, "study.db"));
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS decks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    language TEXT,
    source_name TEXT,
    source_size INTEGER,
    summary_md TEXT NOT NULL,
    study_guide_md TEXT NOT NULL,
    key_terms TEXT NOT NULL,
    flashcards TEXT NOT NULL,
    quiz TEXT NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS usage_weeks (
    key TEXT NOT NULL,
    week TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, week)
  );

  CREATE TABLE IF NOT EXISTS usage_days (
    key TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (key, day)
  );

  CREATE TABLE IF NOT EXISTS email_tokens (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'queued',
    source_name TEXT,
    source_size INTEGER,
    deck_id TEXT,
    title TEXT,
    error TEXT,
    user_id INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

try {
  db.exec("ALTER TABLE decks ADD COLUMN user_id INTEGER");
} catch {
  // Column already exists.
}
try {
  db.exec("ALTER TABLE users ADD COLUMN verified INTEGER NOT NULL DEFAULT 0");
} catch {
  // Column already exists.
}
try {
  db.exec("ALTER TABLE users ADD COLUMN lang TEXT NOT NULL DEFAULT 'hu'");
} catch {
  // Column already exists.
}
try {
  db.exec("ALTER TABLE users ADD COLUMN plan TEXT NOT NULL DEFAULT 'free'");
} catch {
  // Column already exists.
}
try {
  db.exec("ALTER TABLE jobs ADD COLUMN progress TEXT");
} catch {
  // Column already exists.
}
db.exec("CREATE INDEX IF NOT EXISTS idx_decks_user ON decks (user_id)");
db.exec("CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)");

// Quota windows reset on the Budapest calendar (week = Mon–Sun, ISO week).
export function budapestDay(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
  }).format(new Date());
}

export function budapestWeekKey(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Budapest",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const date = new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function getWeeklyUsage(key: string): number {
  const row = db
    .prepare("SELECT count FROM usage_weeks WHERE key = ? AND week = ?")
    .get(key, budapestWeekKey()) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function bumpWeeklyUsage(key: string): void {
  db.prepare(
    `INSERT INTO usage_weeks (key, week, count) VALUES (?, ?, 1)
     ON CONFLICT (key, week) DO UPDATE SET count = count + 1`,
  ).run(key, budapestWeekKey());
}

export function getDailyCounter(key: string): number {
  const row = db
    .prepare("SELECT count FROM usage_days WHERE key = ? AND day = ?")
    .get(key, budapestDay()) as { count: number } | undefined;
  return row?.count ?? 0;
}

export function bumpDailyCounter(key: string, n = 1): void {
  db.prepare(
    `INSERT INTO usage_days (key, day, count) VALUES (?, ?, ?)
     ON CONFLICT (key, day) DO UPDATE SET count = count + ?`,
  ).run(key, budapestDay(), n, n);
}

// Paywall-ready: every account is 'free' today; a paid plan would raise the
// weekly limit here without touching anything else.
export function weeklyLimitFor(plan: string | null | undefined): number {
  return plan === "free" || !plan ? 3 : Number.MAX_SAFE_INTEGER;
}

export function newId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 10);
}

export function insertDeck(
  set: StudySet,
  source: { name: string; size: number },
  userId?: number | null,
): string {
  const id = newId();
  db.prepare(
    `INSERT INTO decks (id, title, language, source_name, source_size, summary_md, study_guide_md, key_terms, flashcards, quiz, user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    set.title,
    set.language,
    source.name,
    source.size,
    set.summary_md,
    set.study_guide_md,
    JSON.stringify(set.key_terms),
    JSON.stringify(set.flashcards),
    JSON.stringify(set.quiz),
    userId ?? null,
  );
  return id;
}

export function getDeck(id: string): DeckRecord | null {
  const row = db
    .prepare(
      `SELECT id, title, language, source_name, source_size, summary_md, study_guide_md, key_terms, flashcards, quiz, views, created_at
       FROM decks WHERE id = ?`,
    )
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return {
    id: row.id as string,
    title: row.title as string,
    language: (row.language as string) || "en",
    source_name: (row.source_name as string) || "",
    source_size: (row.source_size as number) || 0,
    summary_md: row.summary_md as string,
    study_guide_md: row.study_guide_md as string,
    key_terms: JSON.parse((row.key_terms as string) || "[]"),
    flashcards: JSON.parse((row.flashcards as string) || "[]"),
    quiz: JSON.parse((row.quiz as string) || "[]"),
    created_at: row.created_at as string,
  };
}

export function bumpViews(id: string): void {
  db.prepare("UPDATE decks SET views = views + 1 WHERE id = ?").run(id);
}

export type DeckSummary = {
  id: string;
  title: string;
  source_name: string;
  created_at: string;
};

export function listDecksByUser(userId: number): DeckSummary[] {
  return db
    .prepare(
      `SELECT id, title, source_name, created_at FROM decks
       WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
    .all(userId) as DeckSummary[];
}

export function findUserByEmail(
  email: string,
): { id: number; email: string; password_hash: string; verified: number; lang: string } | null {
  return (
    (db
      .prepare("SELECT id, email, password_hash, verified, lang FROM users WHERE email = ?")
      .get(email) as
      | { id: number; email: string; password_hash: string; verified: number; lang: string }
      | undefined) ?? null
  );
}

export function setUserLang(userId: number, lang: string): void {
  db.prepare("UPDATE users SET lang = ? WHERE id = ?").run(lang, userId);
}

export function markUserVerified(userId: number): void {
  db.prepare("UPDATE users SET verified = 1 WHERE id = ?").run(userId);
}

export function getUserPlan(userId: number): string {
  const row = db.prepare("SELECT plan FROM users WHERE id = ?").get(userId) as
    | { plan: string }
    | undefined;
  return row?.plan ?? "free";
}

export function deleteSessionsForUser(userId: number): void {
  db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
}

export type JobRow = {
  id: string;
  status: "queued" | "running" | "done" | "error";
  deck_id: string | null;
  title: string | null;
  error: string | null;
  progress: string | null;
};

export function createJob(
  id: string,
  source: { name: string; size: number },
  userId: number | null,
): void {
  db.prepare(
    "INSERT INTO jobs (id, status, source_name, source_size, user_id) VALUES (?, 'queued', ?, ?, ?)",
  ).run(id, source.name, source.size, userId ?? null);
}

export function setJobStatus(id: string, status: string): void {
  db.prepare("UPDATE jobs SET status = ?, updated_at = datetime('now') WHERE id = ?").run(
    status,
    id,
  );
}

export function setJobProgress(id: string, progress: string): void {
  db.prepare("UPDATE jobs SET progress = ? WHERE id = ?").run(progress, id);
}

export function finishJob(id: string, deckId: string, title: string): void {
  db.prepare(
    "UPDATE jobs SET status = 'done', deck_id = ?, title = ?, updated_at = datetime('now') WHERE id = ?",
  ).run(deckId, title, id);
}

export function failJob(id: string, errorCode: string): void {
  db.prepare("UPDATE jobs SET status = 'error', error = ?, updated_at = datetime('now') WHERE id = ?").run(
    errorCode,
    id,
  );
}

export function getJob(id: string): JobRow | null {
  const row = db
    .prepare("SELECT id, status, deck_id, title, error, progress FROM jobs WHERE id = ?")
    .get(id) as (JobRow & { progress: string | null }) | undefined;
  if (!row) return null;
  // A job stuck "queued"/"running" for >10 min means the server restarted
  // mid-generation and nobody will ever finish it.
  const age = db
    .prepare("SELECT unixepoch() - unixepoch(created_at) AS age FROM jobs WHERE id = ?")
    .get(id) as { age: number } | undefined;
  if (
    (row.status === "queued" || row.status === "running") &&
    age &&
    age.age > 600
  ) {
    failJob(id, "ai-failed");
    return { ...row, status: "error", error: "ai-failed" };
  }
  return row;
}

export function createUser(email: string, passwordHash: string, lang = "hu"): number {
  const info = db
    .prepare("INSERT INTO users (email, password_hash, lang) VALUES (?, ?, ?)")
    .run(email, passwordHash, lang);
  return Number(info.lastInsertRowid);
}

export function updatePasswordHash(userId: number, passwordHash: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, userId);
}

export function createSession(token: string, userId: number, days = 30): void {
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  db.prepare("INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)").run(
    token,
    userId,
    expires,
  );
}

export function getSessionUser(
  token: string,
): { id: number; email: string; plan: string } | null {
  const row = db
    .prepare(
      `SELECT u.id, u.email, u.plan, s.expires_at FROM sessions s
       JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
    )
    .get(token) as
    | { id: number; email: string; plan: string; expires_at: string }
    | undefined;
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteSession(token);
    return null;
  }
  return { id: row.id, email: row.email, plan: row.plan };
}

export function deleteSession(token: string): void {
  db.prepare("DELETE FROM sessions WHERE token = ?").run(token);
}
