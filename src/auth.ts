// المصادقة والجلسات والأدوار (RBAC) — نظام بريد + كلمة مرور داخل المنصة

import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import type { Env, Role, CurrentUser, Vars } from "./types";

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };
export const SESSION_COOKIE = "mah_session";
export const SESSION_DAYS = 30;

// المسارات المسموحة قبل تسجيل الدخول
const PUBLIC_PATHS = new Set(["/api/login"]);
// المسارات المسموحة عندما يجب تغيير كلمة المرور
const PW_CHANGE_ALLOWED = new Set(["/api/me", "/api/change-password", "/api/logout"]);

interface UserRow {
  email: string; name: string; role: Role;
  password_hash: string | null; must_change: number;
}

/** يجلب الجلسة الصالحة ويربطها بالمستخدم، أو يعيد 401. */
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  next: Next
) {
  const path = new URL(c.req.url).pathname;
  if (PUBLIC_PATHS.has(path)) return next();

  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return c.json({ error: "يلزم تسجيل الدخول" }, 401);

  const sess = await c.env.DB.prepare(
    `SELECT email FROM sessions WHERE token = ? AND expires_at > datetime('now')`
  ).bind(token).first<{ email: string }>();
  if (!sess) return c.json({ error: "انتهت الجلسة — سجّل الدخول من جديد" }, 401);

  const row = await c.env.DB.prepare(
    `SELECT email, name, role, password_hash, must_change FROM users WHERE email = ?`
  ).bind(sess.email).first<UserRow>();
  if (!row) return c.json({ error: "الحساب غير موجود" }, 401);

  const user: CurrentUser = {
    email: row.email, name: row.name || row.email, role: row.role,
    must_change: !!row.must_change || !row.password_hash,
  };
  c.set("user", user);

  // إجبار تغيير كلمة المرور قبل استخدام باقي المنصة
  if (user.must_change && !PW_CHANGE_ALLOWED.has(path)) {
    return c.json({ error: "يجب تعيين كلمة مرور جديدة أولاً" }, 403);
  }
  await next();
}

/** يفرض حدّاً أدنى من الدور على المسار. */
export function requireRole(min: Role) {
  return async (c: Context<{ Bindings: Env; Variables: Vars }>, next: Next) => {
    const user = c.get("user");
    if (!user || ROLE_RANK[user.role] < ROLE_RANK[min]) {
      return c.json({ error: "صلاحيات غير كافية لهذا الإجراء" }, 403);
    }
    await next();
  };
}
