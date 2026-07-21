// مسارات تسجيل الدخول/الخروج وتغيير كلمة المرور

import type { Context } from "hono";
import { setCookie, deleteCookie, getCookie } from "hono/cookie";
import type { Env, Vars, Role } from "./types";
import { hashPassword, verifyPassword, newSessionToken } from "./password";
import { SESSION_COOKIE, SESSION_DAYS } from "./auth";
import { auditLog } from "./db";

const DEFAULT_PW = "1234";

interface UserRow {
  email: string; name: string; role: Role;
  password_hash: string | null; must_change: number;
}

async function createSession(c: Context<{ Bindings: Env; Variables: Vars }>, email: string) {
  const token = newSessionToken();
  await c.env.DB.prepare(
    `INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, datetime('now', ?))`
  ).bind(token, email, `+${SESSION_DAYS} days`).run();
  const https = new URL(c.req.url).protocol === "https:";
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true, secure: https, sameSite: "Lax", path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

/** POST /api/login  { email, password } */
export async function login(c: Context<{ Bindings: Env; Variables: Vars }>) {
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; password?: string };
  const email = (b.email || "").toLowerCase().trim();
  const password = b.password || "";
  if (!email || !password) return c.json({ error: "البريد وكلمة المرور مطلوبان" }, 400);

  let row = await c.env.DB.prepare(
    `SELECT email, name, role, password_hash, must_change FROM users WHERE email = ?`
  ).bind(email).first<UserRow>();

  // بذر المالك تلقائياً إن لم يكن موجوداً (بكلمة المرور الافتراضية)
  if (!row) {
    const bootstrap = email === (c.env.BOOTSTRAP_ADMIN_EMAIL || "").toLowerCase();
    if (bootstrap && password === DEFAULT_PW) {
      await c.env.DB.prepare(
        `INSERT INTO users (email, name, role, must_change) VALUES (?, '', 'admin', 1)`
      ).bind(email).run();
      row = { email, name: "", role: "admin", password_hash: null, must_change: 1 };
    } else {
      return c.json({ error: "البريد غير مسجّل أو كلمة المرور غير صحيحة" }, 401);
    }
  }

  // التحقّق: لا كلمة مرور محفوظة → تُقبل الافتراضية 1234 (ويُجبر التغيير)
  let ok: boolean;
  let mustChange = !!row.must_change;
  if (!row.password_hash) {
    ok = password === DEFAULT_PW;
    mustChange = true;
  } else {
    ok = await verifyPassword(password, row.password_hash);
  }
  if (!ok) return c.json({ error: "البريد غير مسجّل أو كلمة المرور غير صحيحة" }, 401);

  await createSession(c, email);
  return c.json({ email, name: row.name || email, role: row.role, must_change: mustChange });
}

/** POST /api/logout */
export async function logout(c: Context<{ Bindings: Env; Variables: Vars }>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
}

/** POST /api/change-password  { new_password } — للمستخدم الحالي */
export async function changePassword(c: Context<{ Bindings: Env; Variables: Vars }>) {
  const user = c.get("user");
  const b = (await c.req.json().catch(() => ({}))) as { new_password?: string };
  const np = (b.new_password || "").trim();
  if (np.length < 4) return c.json({ error: "كلمة المرور قصيرة (4 أحرف على الأقل)" }, 400);
  if (np === DEFAULT_PW) return c.json({ error: "لا يمكن استخدام كلمة المرور الافتراضية" }, 400);

  const hash = await hashPassword(np);
  await c.env.DB.prepare(
    `UPDATE users SET password_hash = ?, must_change = 0 WHERE email = ?`
  ).bind(hash, user.email).run();
  await auditLog(c.env, user.email, "password_change", "users", null, {});
  return c.json({ ok: true });
}
