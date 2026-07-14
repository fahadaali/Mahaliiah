// منطق كشف التكرار — مقابل قاعدة البيانات وداخل الدفعة المستوردة

import type { EntityDef } from "./entities";
import type { Env } from "./types";

const KEY_LABELS: Record<string, string> = {
  iqama_number: "رقم الإقامة",
  cr_number: "رقم السجل التجاري",
  mol_number: "رقم المنشأة",
  plate_number: "رقم اللوحة",
  license_number: "رقم الترخيص",
  name: "الاسم",
  title: "البيان",
  company_id: "الشركة",
};

export interface DupResult {
  duplicate: boolean;
  reason?: string;
}

/**
 * يفحص إن كانت قيم الصفّ تكرّر سجلاً موجوداً في قاعدة البيانات.
 * excludeId: لاستثناء السجل نفسه عند التعديل.
 */
export async function checkDbDuplicate(
  env: Env,
  def: EntityDef,
  values: Record<string, unknown>,
  excludeId?: number
): Promise<DupResult> {
  // 1) مفاتيح الفرادة المفردة
  for (const key of def.uniqueKeys) {
    const v = values[key];
    if (v === null || v === undefined || String(v).trim() === "") continue;
    const sql =
      `SELECT id FROM ${def.table} WHERE ${key} = ?` +
      (excludeId ? ` AND id != ?` : ``) +
      ` LIMIT 1`;
    const stmt = excludeId
      ? env.DB.prepare(sql).bind(v, excludeId)
      : env.DB.prepare(sql).bind(v);
    const row = await stmt.first<{ id: number }>();
    if (row) {
      return { duplicate: true, reason: `${KEY_LABELS[key] || key} «${v}» موجود مسبقاً` };
    }
  }

  // 2) المفتاح المركّب الاحتياطي (عند غياب قيم uniqueKeys) — مثل (company_id + title) للتراخيص
  if (def.compositeKey) {
    const hasUnique = def.uniqueKeys.some(
      (k) => values[k] !== null && values[k] !== undefined && String(values[k]).trim() !== ""
    );
    if (!hasUnique) {
      const cols = def.compositeKey;
      const allPresent = cols.every((c) => values[c] !== null && values[c] !== undefined && String(values[c]).trim() !== "");
      if (allPresent) {
        const where = cols.map((c) => `${c} = ?`).join(" AND ");
        const sql =
          `SELECT id FROM ${def.table} WHERE ${where}` +
          (excludeId ? ` AND id != ?` : ``) +
          ` LIMIT 1`;
        const binds = excludeId ? [...cols.map((c) => values[c]), excludeId] : cols.map((c) => values[c]);
        const row = await env.DB.prepare(sql).bind(...binds).first<{ id: number }>();
        if (row) {
          const label = cols.map((c) => KEY_LABELS[c] || c).join(" + ");
          return { duplicate: true, reason: `سجل بنفس (${label}) موجود مسبقاً` };
        }
      }
    }
  }

  return { duplicate: false };
}

/** مفتاح نصّي يمثّل هوية الصفّ للكشف عن التكرار داخل الدفعة نفسها. */
export function batchKey(def: EntityDef, values: Record<string, unknown>): string | null {
  for (const key of def.uniqueKeys) {
    const v = values[key];
    if (v !== null && v !== undefined && String(v).trim() !== "") {
      return `${key}:${String(v).trim()}`;
    }
  }
  if (def.compositeKey) {
    const parts = def.compositeKey.map((c) => String(values[c] ?? "").trim());
    if (parts.every((p) => p !== "")) return def.compositeKey.join("+") + ":" + parts.join("|");
  }
  return null;
}
