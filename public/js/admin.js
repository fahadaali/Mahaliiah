// شاشات الإدارة — سجل التدقيق وإدارة المستخدمين (للمسؤول)

import { api } from "./api.js";
import { $, $$, el, escapeHtml, fmtDate, toast, openModal, closeModal, confirmDialog } from "./util.js";
import { store } from "./store.js";

const ACTION_AR = {
  create: "إضافة", update: "تعديل", delete: "حذف", import: "استيراد",
  attach: "إرفاق", role_change: "تغيير دور",
};
const ENTITY_AR = {
  companies: "شركات", employees: "موظفون", licenses: "تراخيص",
  vehicles: "مركبات", platforms: "منصات",
};

export class AuditView {
  async mount(container) {
    this.container = container;
    container.innerHTML = `<div class="loading">جارٍ التحميل…</div>`;
    const res = await api.audit();
    const rows = res.data || [];
    const tbl = el("table");
    tbl.innerHTML = `<thead><tr><th>التاريخ</th><th>المستخدم</th><th>الإجراء</th><th>الكيان</th><th>المعرّف</th><th>التفاصيل</th></tr></thead>`;
    const tb = el("tbody");
    rows.forEach((r) => {
      let changes = "";
      try { changes = Object.keys(JSON.parse(r.changes_json || "{}")).join("، "); } catch {}
      tb.appendChild(el("tr", null,
        `<td>${escapeHtml(r.created_at)}</td><td>${escapeHtml(r.user_email)}</td>
         <td><span class="badge b-neutral">${ACTION_AR[r.action] || r.action}</span></td>
         <td>${ENTITY_AR[r.entity_type] || r.entity_type}</td><td>${r.entity_id ?? "—"}</td>
         <td class="hint" style="color:var(--muted)">${escapeHtml(changes)}</td>`));
    });
    tbl.appendChild(tb);
    container.innerHTML = `<div class="section-title" style="margin-top:18px"><span class="dot"></span> سجل التدقيق (آخر 500 عملية)</div>`;
    const wrap = el("div", "table-wrap"); wrap.appendChild(tbl);
    container.appendChild(wrap);
  }
  tickLive() {}
}

export class UsersView {
  async mount(container) {
    this.container = container;
    await this.reload();
  }
  async reload() {
    const res = await api.users();
    this.rows = res.data || [];
    this.render();
  }
  render() {
    const c = this.container;
    c.innerHTML = `<div class="section-title" style="margin-top:18px"><span class="dot"></span> المستخدمون والصلاحيات</div>`;
    const tb = el("div", "toolbar");
    tb.innerHTML = `<div class="grow"></div><button class="btn btn-primary" id="addu">+ إضافة مستخدم</button>`;
    c.appendChild(tb);
    const tbl = el("table");
    tbl.innerHTML = `<thead><tr><th>البريد</th><th>الاسم</th><th>الدور</th><th>أُضيف</th><th>إجراءات</th></tr></thead>`;
    const body = el("tbody");
    const roleAr = { admin: "مسؤول", editor: "محرّر", viewer: "مطّلع" };
    this.rows.forEach((u) => {
      const tr = el("tr");
      tr.innerHTML = `<td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.name || "—")}</td>
        <td><span class="badge b-ok">${roleAr[u.role] || u.role}</span></td>
        <td>${escapeHtml(String(u.created_at || "").slice(0,10))}</td>`;
      const act = el("td"); const box = el("div", "row-actions");
      const e = el("button", "icon-btn icon-edit", "✎"); e.title = "تغيير الدور"; e.onclick = () => this.openForm(u);
      box.appendChild(e);
      if (u.email !== store.user.email) {
        const d = el("button", "icon-btn icon-del", "🗑"); d.title = "حذف"; d.onclick = () => this.remove(u);
        box.appendChild(d);
      }
      act.appendChild(box); tr.appendChild(act); body.appendChild(tr);
    });
    tbl.appendChild(body);
    const wrap = el("div", "table-wrap"); wrap.appendChild(tbl); c.appendChild(wrap);
    $("#addu", c).onclick = () => this.openForm(null);
  }
  openForm(u) {
    openModal(`
      <h3>${u ? "تغيير دور المستخدم" : "إضافة مستخدم"}</h3>
      <div class="body">
        <div class="form-field"><label>البريد الإلكتروني <span class="req">*</span></label>
          <input type="email" id="u-email" value="${escapeHtml(u ? u.email : "")}" ${u ? "readonly" : ""} placeholder="name@example.com"></div>
        <div class="form-field"><label>الاسم</label><input type="text" id="u-name" value="${escapeHtml(u ? u.name || "" : "")}"></div>
        <div class="form-field"><label>الدور</label><select id="u-role">
          <option value="viewer" ${u && u.role === "viewer" ? "selected" : ""}>مطّلع (عرض وتصدير)</option>
          <option value="editor" ${u && u.role === "editor" ? "selected" : ""}>محرّر (تعديل واستيراد)</option>
          <option value="admin" ${u && u.role === "admin" ? "selected" : ""}>مسؤول (كل الصلاحيات)</option>
        </select><div class="hint">يجب أن يكون البريد مطابقاً لبريد دخول Cloudflare Access.</div></div>
      </div>
      <div class="foot"><button class="btn btn-primary" id="save">حفظ</button><button class="btn btn-ghost" id="cancel">إلغاء</button></div>`);
    $("#cancel").onclick = closeModal;
    $("#save").onclick = async () => {
      const email = $("#u-email").value.trim();
      if (!email) { toast("البريد مطلوب", "err"); return; }
      try {
        await api.saveUser({ email, name: $("#u-name").value.trim(), role: $("#u-role").value });
        closeModal(); toast("تم الحفظ", "ok"); this.reload();
      } catch (e) { toast(e.message, "err"); }
    };
  }
  async remove(u) {
    if (!(await confirmDialog(`حذف المستخدم «${u.email}»؟`))) return;
    try { await api.removeUser(u.email); toast("حُذف المستخدم", "ok"); this.reload(); }
    catch (e) { toast(e.message, "err"); }
  }
  tickLive() {}
}
