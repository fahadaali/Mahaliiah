// منصة المحلية · mahalliah — نقطة الدخول (Cloudflare Worker + Hono)

import { Hono } from "hono";
import type { Env, Vars, Role } from "./types";
import { authMiddleware, requireRole } from "./auth";
import { isEntity, ENTITIES } from "./entities";
import {
  listEntity, createEntity, updateEntity, deleteEntity, exportEntity, importEntity,
} from "./crud";
import {
  uploadAttachment, listAttachments, downloadAttachment, deleteAttachment,
} from "./attachments";
import { computeAlerts, runDailyAlerts } from "./alerts";
import { login, logout, changePassword } from "./authroutes";

const app = new Hono<{ Bindings: Env; Variables: Vars }>();

// كل مسارات API تمرّ بوسيط المصادقة (يستثني /api/login داخلياً)
app.use("/api/*", authMiddleware);

// ---------- تسجيل الدخول/الخروج وكلمة المرور ----------
app.post("/api/login", login);
app.post("/api/logout", logout);
app.post("/api/change-password", changePassword);

// ---------- الهوية والتعريف ----------
app.get("/api/me", (c) => c.json(c.get("user")));

app.get("/api/meta", (c) =>
  c.json({
    entities: Object.fromEntries(
      Object.entries(ENTITIES).map(([k, v]) => [
        k,
        { label: v.labelAr, fields: v.fields, uniqueKeys: v.uniqueKeys },
      ])
    ),
  })
);

// ---------- التنبيهات ----------
app.get("/api/alerts", async (c) => {
  const win = parseInt(c.req.query("window") || "90", 10);
  const items = await computeAlerts(c.env, isNaN(win) ? 90 : win);
  return c.json({ data: items });
});

// ---------- CRUD عام لكل كيان ----------
const entityGuard = async (c: any, next: any) => {
  if (!isEntity(c.req.param("entity"))) return c.json({ error: "كيان غير معروف" }, 404);
  await next();
};

app.get("/api/e/:entity", entityGuard, (c) => listEntity(c, c.req.param("entity")!));
app.get("/api/e/:entity/export", entityGuard, (c) => exportEntity(c, c.req.param("entity")!));

app.post("/api/e/:entity", entityGuard, requireRole("editor"), (c) =>
  createEntity(c, c.req.param("entity")!)
);
app.put("/api/e/:entity/:id", entityGuard, requireRole("editor"), (c) =>
  updateEntity(c, c.req.param("entity")!, parseInt(c.req.param("id")!, 10))
);
app.delete("/api/e/:entity/:id", entityGuard, requireRole("editor"), (c) =>
  deleteEntity(c, c.req.param("entity")!, parseInt(c.req.param("id")!, 10))
);
app.post("/api/e/:entity/import", entityGuard, requireRole("editor"), (c) =>
  importEntity(c, c.req.param("entity")!)
);

// ---------- المرفقات ----------
app.get("/api/attachments", listAttachments);
app.get("/api/attachments/:id", (c) => downloadAttachment(c, parseInt(c.req.param("id")!, 10)));
app.post("/api/attachments", requireRole("editor"), uploadAttachment);
app.delete("/api/attachments/:id", requireRole("editor"), (c) =>
  deleteAttachment(c, parseInt(c.req.param("id")!, 10))
);

// ---------- سجل التدقيق (مسؤول) ----------
app.get("/api/audit", requireRole("admin"), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM audit_log ORDER BY id DESC LIMIT 500`
  ).all();
  return c.json({ data: results });
});

// ---------- إدارة المستخدمين (مسؤول) ----------
app.get("/api/users", requireRole("admin"), async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT email, name, role, created_at FROM users ORDER BY created_at`
  ).all();
  return c.json({ data: results });
});

app.post("/api/users", requireRole("admin"), async (c) => {
  const b = (await c.req.json().catch(() => ({}))) as { email?: string; name?: string; role?: Role };
  const email = (b.email || "").toLowerCase().trim();
  const role = b.role || "viewer";
  if (!email) return c.json({ error: "البريد مطلوب" }, 400);
  if (!["admin", "editor", "viewer"].includes(role)) return c.json({ error: "دور غير صالح" }, 400);
  await c.env.DB.prepare(
    `INSERT INTO users (email, name, role) VALUES (?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET role = excluded.role, name = excluded.name`
  )
    .bind(email, b.name || "", role)
    .run();
  return c.json({ email, role });
});

app.delete("/api/users/:email", requireRole("admin"), async (c) => {
  const email = decodeURIComponent(c.req.param("email")!).toLowerCase();
  if (email === c.get("user").email) return c.json({ error: "لا يمكنك حذف حسابك" }, 400);
  await c.env.DB.prepare(`DELETE FROM users WHERE email = ?`).bind(email).run();
  return c.json({ ok: true });
});

// أي مسار API غير معروف
app.all("/api/*", (c) => c.json({ error: "مسار غير موجود" }, 404));

export default {
  fetch: app.fetch,
  // مهمة Cron اليومية
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runDailyAlerts(env));
  },
};
