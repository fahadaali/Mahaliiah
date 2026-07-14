// معالجات CRUD العامة + الاستيراد/التصدير لكل الكيانات

import type { Context } from "hono";
import type { Env, Vars } from "./types";
import { ENTITIES, EntityDef } from "./entities";
import { normalizeRow } from "./validate";
import { checkDbDuplicate, batchKey } from "./dedup";
import { auditLog } from "./db";

function def(entity: string): EntityDef {
  return ENTITIES[entity];
}

// قائمة السجلات (مع اسم الشركة عند وجود company_id)
export async function listEntity(c: Context<{ Bindings: Env; Variables: Vars }>, entity: string) {
  const d = def(entity);
  const hasCompany = d.fields.some((f) => f.type === "companyRef");
  const sql = hasCompany
    ? `SELECT t.*, co.name AS company_name FROM ${d.table} t
       LEFT JOIN companies co ON co.id = t.company_id ORDER BY t.id DESC`
    : `SELECT * FROM ${d.table} ORDER BY id DESC`;
  const { results } = await c.env.DB.prepare(sql).all();
  return c.json({ data: results });
}

function buildInsert(d: EntityDef, values: Record<string, unknown>) {
  const present = Object.keys(values).filter((col) => values[col] !== undefined);
  const placeholders = present.map(() => "?").join(", ");
  const binds = present.map((col) => values[col] ?? null);
  return { sql: `INSERT INTO ${d.table} (${present.join(", ")}) VALUES (${placeholders})`, binds };
}

export async function createEntity(c: Context<{ Bindings: Env; Variables: Vars }>, entity: string) {
  const d = def(entity);
  const input = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const { values, errors } = await normalizeRow(c.env, d, input);
  if (errors.length) return c.json({ error: errors.join("، ") }, 400);

  const dup = await checkDbDuplicate(c.env, d, values);
  if (dup.duplicate) return c.json({ error: dup.reason }, 409);

  const { sql, binds } = buildInsert(d, values);
  const res = await c.env.DB.prepare(sql).bind(...binds).run();
  const id = res.meta.last_row_id as number;
  await auditLog(c.env, c.get("user").email, "create", entity, id, values);
  return c.json({ id, ...values }, 201);
}

export async function updateEntity(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  entity: string,
  id: number
) {
  const d = def(entity);
  const input = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const { values, errors } = await normalizeRow(c.env, d, input);
  if (errors.length) return c.json({ error: errors.join("، ") }, 400);

  const dup = await checkDbDuplicate(c.env, d, values, id);
  if (dup.duplicate) return c.json({ error: dup.reason }, 409);

  const cols = Object.keys(values).filter((k) => values[k] !== undefined);
  const setClause = cols.map((col) => `${col} = ?`).join(", ");
  const binds = cols.map((col) => values[col] ?? null);
  await c.env.DB.prepare(
    `UPDATE ${d.table} SET ${setClause}, updated_at = datetime('now') WHERE id = ?`
  )
    .bind(...binds, id)
    .run();
  await auditLog(c.env, c.get("user").email, "update", entity, id, values);
  return c.json({ id, ...values });
}

export async function deleteEntity(
  c: Context<{ Bindings: Env; Variables: Vars }>,
  entity: string,
  id: number
) {
  const d = def(entity);
  await c.env.DB.prepare(`DELETE FROM ${d.table} WHERE id = ?`).bind(id).run();
  await auditLog(c.env, c.get("user").email, "delete", entity, id, {});
  return c.json({ ok: true });
}

// تصدير: يُرجع صفوفاً بترويسات عربية + قيمة الشركة كاسم
export async function exportEntity(c: Context<{ Bindings: Env; Variables: Vars }>, entity: string) {
  const d = def(entity);
  const hasCompany = d.fields.some((f) => f.type === "companyRef");
  const sql = hasCompany
    ? `SELECT t.*, co.name AS company_name FROM ${d.table} t
       LEFT JOIN companies co ON co.id = t.company_id ORDER BY t.id`
    : `SELECT * FROM ${d.table} ORDER BY id`;
  const { results } = await c.env.DB.prepare(sql).all<Record<string, unknown>>();
  const rows = (results || []).map((r) => {
    const o: Record<string, unknown> = {};
    for (const f of d.fields) {
      if (f.type === "companyRef") o[f.header] = r["company_name"] ?? "";
      else o[f.header] = r[f.col] ?? "";
    }
    return o;
  });
  return c.json({ entity, label: d.labelAr, headers: d.fields.map((f) => f.header), rows });
}

// استيراد مع رفض التكرار (مقابل القاعدة وداخل الدفعة)
export async function importEntity(c: Context<{ Bindings: Env; Variables: Vars }>, entity: string) {
  const d = def(entity);
  const body = (await c.req.json().catch(() => ({}))) as { rows?: Record<string, unknown>[] };
  const rows = body.rows || [];
  if (!Array.isArray(rows) || rows.length === 0) {
    return c.json({ error: "لا توجد صفوف للاستيراد" }, 400);
  }

  const accepted: unknown[] = [];
  const rejected: { row: number; reason: string; data: Record<string, unknown> }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 1;
    const { values, errors } = await normalizeRow(c.env, d, rows[i]);
    if (errors.length) {
      rejected.push({ row: rowNo, reason: errors.join("، "), data: rows[i] });
      continue;
    }
    // تكرار داخل نفس الملف
    const bk = batchKey(d, values);
    if (bk && seen.has(bk)) {
      rejected.push({ row: rowNo, reason: "مكرّر داخل الملف المستورد", data: rows[i] });
      continue;
    }
    // تكرار مقابل قاعدة البيانات
    const dup = await checkDbDuplicate(c.env, d, values);
    if (dup.duplicate) {
      rejected.push({ row: rowNo, reason: dup.reason!, data: rows[i] });
      continue;
    }
    if (bk) seen.add(bk);
    const { sql, binds } = buildInsert(d, values);
    const res = await c.env.DB.prepare(sql).bind(...binds).run();
    accepted.push({ id: res.meta.last_row_id, ...values });
  }

  await auditLog(c.env, c.get("user").email, "import", entity, null, {
    accepted: accepted.length,
    rejected: rejected.length,
  });

  return c.json({
    entity,
    total: rows.length,
    acceptedCount: accepted.length,
    rejectedCount: rejected.length,
    rejected,
  });
}
