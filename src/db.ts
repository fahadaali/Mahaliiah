// مساعدات قاعدة البيانات وسجل التدقيق

import type { Env } from "./types";

export async function auditLog(
  env: Env,
  userEmail: string,
  action: string,
  entityType: string,
  entityId: number | null,
  changes: unknown
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (user_email, action, entity_type, entity_id, changes_json)
       VALUES (?, ?, ?, ?, ?)`
    )
      .bind(userEmail, action, entityType, entityId, JSON.stringify(changes ?? {}))
      .run();
  } catch (e) {
    // لا نُفشل الطلب بسبب فشل التدقيق
    console.error("audit failed", e);
  }
}

/** يحلّ معرّف الشركة من اسمها (لعمليات الاستيراد التي تحمل اسم الشركة نصاً). */
export async function resolveCompanyId(env: Env, name: string): Promise<number | null> {
  const n = (name || "").trim();
  if (!n) return null;
  const row = await env.DB.prepare(
    `SELECT id FROM companies WHERE name = ? LIMIT 1`
  )
    .bind(n)
    .first<{ id: number }>();
  return row ? row.id : null;
}

export function nowIso(): string {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}
