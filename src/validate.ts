// تحقّق وتطبيع قيم الحقول حسب تعريف الكيان

import type { EntityDef } from "./entities";
import type { Env } from "./types";
import { resolveCompanyId } from "./db";

export interface NormalizedRow {
  values: Record<string, unknown>;
  errors: string[];
}

export function normalizeDate(v: unknown): string | null {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const s = String(v).trim();
  // ISO أو yyyy-mm-dd
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) {
    const y = m[1], mo = m[2].padStart(2, "0"), d = m[3].padStart(2, "0");
    return `${y}-${mo}-${d}`;
  }
  // dd/mm/yyyy
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  // قيمة تاريخ من Excel (رقم تسلسلي) أو نص Date
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null; // غير قابل للتحليل → يُترك فارغاً
}

/**
 * يطبّع صفّاً واردًا (من نموذج أو من Excel) إلى قيم أعمدة قاعدة البيانات.
 * الحقول من نوع companyRef: يقبل company_id رقمياً مباشرة، أو اسم شركة نصاً يُحَل.
 */
export async function normalizeRow(
  env: Env,
  def: EntityDef,
  input: Record<string, unknown>
): Promise<NormalizedRow> {
  const values: Record<string, unknown> = {};
  const errors: string[] = [];

  for (const f of def.fields) {
    // اقبل القيمة إمّا باسم العمود أو بالترويسة العربية (للاستيراد)
    let raw =
      input[f.col] !== undefined ? input[f.col] : input[f.header];

    if (f.type === "companyRef") {
      // company_id مباشرة
      if (typeof raw === "number" || (typeof raw === "string" && /^\d+$/.test(raw))) {
        values["company_id"] = Number(raw);
      } else if (typeof raw === "string" && raw.trim()) {
        const id = await resolveCompanyId(env, raw);
        values["company_id"] = id; // قد يكون null إن لم تُطابق شركة
      } else {
        values["company_id"] = null;
      }
      continue;
    }

    if (raw === undefined || raw === null) raw = "";

    if (f.type === "date") {
      values[f.col] = normalizeDate(raw);
    } else if (f.type === "int") {
      const n = parseInt(String(raw), 10);
      values[f.col] = isNaN(n) ? null : n;
    } else {
      const s = String(raw).trim();
      if (f.required && s === "") errors.push(`الحقل «${f.header}» مطلوب`);
      values[f.col] = s;
    }
  }

  return { values, errors };
}
