// Reset a user's password: node scripts/reset-password.mjs <email> <new-password>
// Passwords are scrypt-hashed (salt:hex, 64 bytes) — same format as lib/auth.ts.
import { randomBytes, scrypt, timingSafeEqual } from "crypto";
import { promisify } from "util";
import Database from "better-sqlite3";
import path from "path";

const scryptAsync = promisify(scrypt);

const [email, password] = process.argv.slice(2);
if (!email || !password) {
  console.error("Usage: node scripts/reset-password.mjs <email> <new-password>");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

const db = new Database(path.join(process.cwd(), "data", "study.db"));
db.pragma("journal_mode = WAL");

const user = db.prepare("SELECT id, email FROM users WHERE email = ?").get(email.toLowerCase());
if (!user) {
  console.error(`No user found with email: ${email}`);
  console.log("Existing users:");
  for (const u of db.prepare("SELECT email, created_at FROM users ORDER BY id").all()) {
    console.log(`  - ${u.email} (created ${u.created_at})`);
  }
  process.exit(1);
}

const salt = randomBytes(16).toString("hex");
const derived = await scryptAsync(password, salt, 64);
const hash = `${salt}:${derived.toString("hex")}`;

db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(hash, user.id);
db.prepare("DELETE FROM sessions WHERE user_id = ?").run(user.id);

const check = db.prepare("SELECT password_hash FROM users WHERE id = ?").get(user.id);
const [cSalt, cKey] = check.password_hash.split(":");
const verify = await scryptAsync(password, cSalt, 64);
const ok = timingSafeEqual(verify, Buffer.from(cKey, "hex"));

console.log(`Password reset for ${user.email} (user id ${user.id}).`);
console.log(`Verification: ${ok ? "OK" : "FAILED"}`);
console.log("All their sessions were logged out.");
