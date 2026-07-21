// أدوات مشتركة — التواريخ، الحساب الحي، الهجري، الحالة، الرسائل، النوافذ

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

export function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
}

// عدّاد تصاعدي متحرّك للأرقام (يحترم تقليل الحركة)
export function countUp(el, to, dur = 900) {
  to = Number(to) || 0;
  if (!el) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.textContent = to; return; }
  const start = performance.now();
  function tick(now) {
    const p = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(to * eased);
    if (p < 1) requestAnimationFrame(tick);
    else el.textContent = to;
  }
  requestAnimationFrame(tick);
}

export function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

// ---- حالة الوثيقة بناءً على التاريخ الحي (الآن) ----
export const STATUS = {
  valid:   { ar: "ساري",         cls: "b-ok",      color: "var(--ok)" },
  soon:    { ar: "قريب الانتهاء", cls: "b-warn",    color: "var(--warn)" },
  expired: { ar: "منتهي",        cls: "b-danger",  color: "var(--danger)" },
  none:    { ar: "—",            cls: "b-neutral", color: "var(--neutral)" },
};

const MS_DAY = 86400000;
function startOfToday() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

/** الأيام المتبقّية حتى تاريخ ISO — يُحسب حياً من لحظة الاستدعاء. */
export function daysUntil(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return null;
  return Math.round((d - startOfToday()) / MS_DAY);
}

export function statusOf(iso, soonDays = 90) {
  const d = daysUntil(iso);
  if (d === null) return "none";
  if (d < 0) return "expired";
  if (d <= soonDays) return "soon";
  return "valid";
}

export function daysText(d) {
  if (d === null || d === undefined) return "—";
  if (d < 0) return `منذ ${Math.abs(d)} يوم`;
  if (d === 0) return "اليوم";
  return `${d} يوم`;
}

export function badge(iso, soonDays = 90) {
  const s = STATUS[statusOf(iso, soonDays)];
  return `<span class="badge ${s.cls}">${s.ar}</span>`;
}

// ---- التواريخ ----
export function fmtDate(iso) {
  if (!iso) return "—";
  const p = String(iso).slice(0, 10).split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
}

let hijriFmt = null;
export function toHijri(iso) {
  if (!iso) return "";
  try {
    if (!hijriFmt)
      hijriFmt = new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
        day: "2-digit", month: "2-digit", year: "numeric",
      });
    const d = new Date(iso + "T12:00:00");
    if (isNaN(d.getTime())) return "";
    return hijriFmt.format(d).replace(/‏/g, "");
  } catch { return ""; }
}

// ---- رسائل منبثقة ----
let toastTimer = null;
export function toast(msg, kind = "info", ms = 3200) {
  const t = $("#toast");
  t.className = "toast show " + kind;
  t.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.className = "toast"), ms);
}

// ---- نافذة منبثقة ----
export function openModal(html) {
  $("#modal").innerHTML = html;
  $("#modal-back").classList.add("show");
}
export function closeModal() {
  $("#modal-back").classList.remove("show");
  $("#modal").innerHTML = "";
}
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "modal-back") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

export async function confirmDialog(message) {
  return new Promise((resolve) => {
    openModal(`
      <h3>تأكيد</h3>
      <div class="body"><p style="margin:0">${escapeHtml(message)}</p></div>
      <div class="foot">
        <button class="btn btn-danger" id="cd-yes">حذف</button>
        <button class="btn btn-ghost" id="cd-no">إلغاء</button>
      </div>`);
    $("#cd-yes").onclick = () => { closeModal(); resolve(true); };
    $("#cd-no").onclick = () => { closeModal(); resolve(false); };
  });
}
