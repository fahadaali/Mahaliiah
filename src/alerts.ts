// حساب التنبيهات (قريب الانتهاء/منتهٍ) + مهمة Cron اليومية والبريد الاختياري

import type { Env } from "./types";

export interface AlertItem {
  type: string;      // نوع الكيان بالعربية
  entity: string;    // اسم الجدول
  id: number;
  name: string;      // وصف السجل
  company: string;
  field: string;     // الحقل المنتهي
  expiry: string;    // ISO
  days: number;      // المتبقّي (سالب = منتهٍ)
}

function daysBetween(iso: string, today: Date): number {
  const d = new Date(iso + "T00:00:00Z");
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return Math.round((d.getTime() - t.getTime()) / 86400000);
}

/** يجمع كل الوثائق ضمن نافذة (windowDays يوماً) أو المنتهية. */
export async function computeAlerts(env: Env, windowDays = 90): Promise<AlertItem[]> {
  const today = new Date();
  const items: AlertItem[] = [];

  const push = (
    type: string, entity: string, id: number, name: string,
    company: string, field: string, expiry: string | null
  ) => {
    if (!expiry) return;
    const days = daysBetween(expiry, today);
    if (days <= windowDays) items.push({ type, entity, id, name, company, field, expiry, days });
  };

  // الإقامات
  const emp = await env.DB.prepare(
    `SELECT e.id, e.name, e.iqama_expiry, co.name AS company
     FROM employees e LEFT JOIN companies co ON co.id = e.company_id
     WHERE e.iqama_expiry IS NOT NULL AND e.iqama_expiry != ''`
  ).all<any>();
  for (const r of emp.results || [])
    push("إقامة", "employees", r.id, r.name, r.company || "", "انتهاء الإقامة", r.iqama_expiry);

  // التراخيص
  const lic = await env.DB.prepare(
    `SELECT l.id, l.title, l.expiry, co.name AS company
     FROM licenses l LEFT JOIN companies co ON co.id = l.company_id
     WHERE l.expiry IS NOT NULL AND l.expiry != ''`
  ).all<any>();
  for (const r of lic.results || [])
    push("ترخيص", "licenses", r.id, r.title, r.company || "", "تاريخ الانتهاء", r.expiry);

  // المركبات (الاستمارة والفحص)
  const veh = await env.DB.prepare(
    `SELECT v.id, v.type, v.plate_number, v.form_expiry, v.inspection_expiry, co.name AS company
     FROM vehicles v LEFT JOIN companies co ON co.id = v.company_id`
  ).all<any>();
  for (const r of veh.results || []) {
    const label = `${r.type} — ${r.plate_number}`;
    push("استمارة", "vehicles", r.id, label, r.company || "", "انتهاء الاستمارة", r.form_expiry);
    push("فحص", "vehicles", r.id, label, r.company || "", "انتهاء الفحص", r.inspection_expiry);
  }

  items.sort((a, b) => a.days - b.days);
  return items;
}

/** مهمة Cron: تحسب التنبيهات وترسل بريداً عبر Resend إن تهيّأ. */
export async function runDailyAlerts(env: Env): Promise<void> {
  const items = await computeAlerts(env, 90);
  const urgent = items.filter((i) => i.days <= 30);
  if (urgent.length === 0) return;
  if (!env.RESEND_API_KEY || !env.ALERT_TO_EMAILS) return;

  const rows = urgent
    .map(
      (i) =>
        `<tr><td>${i.type}</td><td>${i.name}</td><td>${i.company}</td><td>${i.expiry}</td><td>${
          i.days < 0 ? "منتهٍ" : i.days + " يوم"
        }</td></tr>`
    )
    .join("");
  const html = `<div dir="rtl" style="font-family:sans-serif">
    <h2>تنبيه: وثائق تحتاج تجديداً خلال 30 يوماً</h2>
    <table border="1" cellpadding="6" style="border-collapse:collapse">
    <tr><th>النوع</th><th>البيان</th><th>الشركة</th><th>الانتهاء</th><th>المتبقّي</th></tr>
    ${rows}</table></div>`;

  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "منصة المحلية <alerts@mahalliah.app>",
      to: env.ALERT_TO_EMAILS.split(",").map((s) => s.trim()),
      subject: `تنبيه المحلية: ${urgent.length} وثيقة تحتاج متابعة`,
      html,
    }),
  }).catch((e) => console.error("resend failed", e));
}
