// وسيط المصادقة والأدوار (RBAC) لمنصة المحلية

import type { Context, Next } from "hono";
import type { Env, Role, CurrentUser, Vars } from "./types";
import { verifyAccessJwt } from "./access";

const ROLE_RANK: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

/** يحدّد المستخدم الحالي من رمز Access ويربط دوره من قاعدة البيانات. */
export async function authMiddleware(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  next: Next
) {
  const env = c.env;

  let email = "";
  let name = "";

  if (env.DEV_BYPASS_AUTH === "true") {
    // وضع تطوير محلي فقط: هوية وهمية للاختبار دون Access
    email = (c.req.header("X-Dev-Email") || env.BOOTSTRAP_ADMIN_EMAIL || "dev@local").toLowerCase();
    name = "مستخدم التطوير";
  } else {
    const token =
      c.req.header("Cf-Access-Jwt-Assertion") ||
      c.req.header("cf-access-jwt-assertion") ||
      "";
    if (!token) {
      return c.json({ error: "غير مصرّح — يلزم تسجيل الدخول عبر Cloudflare Access" }, 401);
    }
    try {
      const id = await verifyAccessJwt(token, env.ACCESS_TEAM_DOMAIN, env.ACCESS_AUD);
      email = id.email;
      name = id.name;
    } catch (e) {
      return c.json({ error: "فشل التحقّق من الهوية: " + (e as Error).message }, 401);
    }
  }

  // اجلب الدور، أو أنشئ المستخدم. أول مستخدم أو البريد المُبذّر → admin.
  let row = await env.DB.prepare(`SELECT email, name, role FROM users WHERE email = ?`)
    .bind(email)
    .first<{ email: string; name: string; role: Role }>();

  if (!row) {
    const countRow = await env.DB.prepare(`SELECT COUNT(*) AS n FROM users`).first<{ n: number }>();
    const isFirst = (countRow?.n ?? 0) === 0;
    const bootstrap = email === (env.BOOTSTRAP_ADMIN_EMAIL || "").toLowerCase();
    const role: Role = isFirst || bootstrap ? "admin" : "viewer";
    await env.DB.prepare(`INSERT INTO users (email, name, role) VALUES (?, ?, ?)`)
      .bind(email, name, role)
      .run();
    row = { email, name, role };
  }

  const user: CurrentUser = { email: row.email, name: row.name || name, role: row.role };
  c.set("user", user);
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
