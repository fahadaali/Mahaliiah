// المرفقات — رفع/تنزيل/حذف عبر Cloudflare R2

import type { Context } from "hono";
import type { Env, Vars } from "./types";
import { isEntity } from "./entities";
import { auditLog } from "./db";

export async function uploadAttachment(c: Context<{ Bindings: Env; Variables: Vars }>) {
  const form = await c.req.formData();
  const file = form.get("file") as unknown as File | null;
  const entityType = String(form.get("entity_type") || "");
  const entityId = parseInt(String(form.get("entity_id") || "0"), 10);

  if (!file || typeof (file as any).arrayBuffer !== "function") {
    return c.json({ error: "لا يوجد ملف" }, 400);
  }
  if (!isEntity(entityType)) return c.json({ error: "نوع كيان غير صالح" }, 400);
  if (!entityId) return c.json({ error: "معرّف السجل مطلوب" }, 400);
  if (file.size > 15 * 1024 * 1024) return c.json({ error: "الحجم يتجاوز 15 ميجابايت" }, 400);

  const key = `${entityType}/${entityId}/${Date.now()}-${crypto.randomUUID()}-${file.name}`;
  await c.env.DOCS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || "application/octet-stream" },
  });
  const res = await c.env.DB.prepare(
    `INSERT INTO attachments (entity_type, entity_id, r2_key, filename, content_type, size, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(entityType, entityId, key, file.name, file.type || "", file.size, c.get("user").email)
    .run();
  await auditLog(c.env, c.get("user").email, "attach", entityType, entityId, { filename: file.name });
  return c.json({ id: res.meta.last_row_id, filename: file.name, size: file.size }, 201);
}

export async function listAttachments(c: Context<{ Bindings: Env; Variables: Vars }>) {
  const entityType = c.req.query("entity_type") || "";
  const entityId = parseInt(c.req.query("entity_id") || "0", 10);
  const { results } = await c.env.DB.prepare(
    `SELECT id, filename, content_type, size, uploaded_by, uploaded_at
     FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY id DESC`
  )
    .bind(entityType, entityId)
    .all();
  return c.json({ data: results });
}

export async function downloadAttachment(c: Context<{ Bindings: Env; Variables: Vars }>, id: number) {
  const row = await c.env.DB.prepare(
    `SELECT r2_key, filename, content_type FROM attachments WHERE id = ?`
  )
    .bind(id)
    .first<{ r2_key: string; filename: string; content_type: string }>();
  if (!row) return c.json({ error: "غير موجود" }, 404);
  const obj = await c.env.DOCS.get(row.r2_key);
  if (!obj) return c.json({ error: "الملف غير متوفّر" }, 404);
  return new Response(obj.body, {
    headers: {
      "Content-Type": row.content_type || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(row.filename)}`,
    },
  });
}

export async function deleteAttachment(c: Context<{ Bindings: Env; Variables: Vars }>, id: number) {
  const row = await c.env.DB.prepare(`SELECT r2_key FROM attachments WHERE id = ?`)
    .bind(id)
    .first<{ r2_key: string }>();
  if (row) {
    await c.env.DOCS.delete(row.r2_key);
    await c.env.DB.prepare(`DELETE FROM attachments WHERE id = ?`).bind(id).run();
  }
  return c.json({ ok: true });
}
