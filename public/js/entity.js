// شاشة إدارة عامة لكل كيان: جدول + بحث/فرز + إضافة/تعديل/حذف + استيراد/تصدير + مرفقات

import { api } from "./api.js";
import { store, canEdit, refreshCompanies, companyName } from "./store.js";
import {
  $, $$, el, escapeHtml, toast, openModal, closeModal, confirmDialog,
  fmtDate, toHijri, badge, daysUntil, daysText, statusOf, STATUS,
} from "./util.js";

const DATE_COLS = new Set(["iqama_expiry", "expiry", "form_expiry", "inspection_expiry"]);

export class EntityView {
  constructor(entity, def) {
    this.entity = entity;
    this.def = def;
    this.rows = [];
    this.filtered = [];
    this.q = "";
    this.statusFilter = "";
    this.sort = { col: null, dir: 1 };
    this.hasDate = def.fields.some((f) => f.type === "date");
    this.hasCompany = def.fields.some((f) => f.type === "companyRef");
  }

  async mount(container) {
    this.container = container;
    container.innerHTML = `<div class="loading">جارٍ التحميل…</div>`;
    if (this.hasCompany && store.companies.length === 0) await refreshCompanies();
    await this.reload();
  }

  async reload() {
    const res = await api.list(this.entity);
    this.rows = res.data || [];
    this.render();
  }

  applyFilter() {
    const q = this.q.trim().toLowerCase();
    this.filtered = this.rows.filter((r) => {
      if (q) {
        const hay = this.def.fields
          .map((f) => (f.type === "companyRef" ? r.company_name : r[f.col]))
          .concat([r.company_name])
          .join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (this.statusFilter && this.hasDate) {
        const dateCol = this.def.fields.find((f) => f.type === "date");
        if (dateCol && statusOf(r[dateCol.col]) !== this.statusFilter) return false;
      }
      return true;
    });
    if (this.sort.col) {
      const c = this.sort.col, dir = this.sort.dir;
      this.filtered.sort((a, b) => {
        let x = a[c] ?? "", y = b[c] ?? "";
        return String(x).localeCompare(String(y), "ar", { numeric: true }) * dir;
      });
    }
  }

  render() {
    this.applyFilter();
    const edit = canEdit();
    const c = this.container;
    c.innerHTML = "";

    // شريط الأدوات
    const tb = el("div", "toolbar");
    tb.innerHTML = `
      <div class="grow"><input type="search" id="q" placeholder="بحث…" value="${escapeHtml(this.q)}"></div>
      ${this.hasDate ? `<select id="sf">
        <option value="">كل الحالات</option>
        <option value="valid">ساري</option>
        <option value="soon">قريب الانتهاء</option>
        <option value="expired">منتهي</option>
      </select>` : ""}
      ${edit ? `<button class="btn btn-primary" id="add">+ إضافة</button>` : ""}
      ${edit ? `<button class="btn btn-ghost" id="imp">استيراد Excel</button>` : ""}
      <button class="btn btn-dark" id="exp">تصدير Excel</button>`;
    c.appendChild(tb);

    // الجدول
    const wrap = el("div", "table-wrap");
    wrap.appendChild(this.buildTable(edit));
    c.appendChild(wrap);

    // ربط الأحداث
    $("#q", c).oninput = (e) => { this.q = e.target.value; this.render(); };
    if (this.hasDate) { const sf = $("#sf", c); sf.value = this.statusFilter; sf.onchange = (e) => { this.statusFilter = e.target.value; this.render(); }; }
    if (edit) {
      $("#add", c).onclick = () => this.openForm(null);
      $("#imp", c).onclick = () => this.openImport();
    }
    $("#exp", c).onclick = () => this.exportExcel();
  }

  buildTable(edit) {
    if (!this.filtered.length) {
      const d = el("div", "empty", "لا توجد سجلات مطابقة");
      return d;
    }
    const tbl = el("table");
    const thead = el("thead");
    const tr = el("tr");
    for (const f of this.def.fields) {
      const th = el("th", null, escapeHtml(f.header) + ` <span class="arr">⇅</span>`);
      const col = f.type === "companyRef" ? "company_name" : f.col;
      th.onclick = () => {
        if (this.sort.col === col) this.sort.dir *= -1;
        else { this.sort.col = col; this.sort.dir = 1; }
        this.render();
      };
      tr.appendChild(th);
      // عمود متبقّي/حالة بعد كل عمود تاريخ
      if (f.type === "date") {
        tr.appendChild(el("th", null, "المتبقّي"));
        tr.appendChild(el("th", null, "الحالة"));
      }
    }
    tr.appendChild(el("th", null, "إجراءات"));
    thead.appendChild(tr);
    tbl.appendChild(thead);

    const tb = el("tbody");
    for (const r of this.filtered) {
      const row = el("tr");
      row.dataset.id = r.id;
      for (const f of this.def.fields) {
        if (f.type === "companyRef") {
          row.appendChild(el("td", null, escapeHtml(r.company_name || "—")));
        } else if (f.type === "date") {
          const iso = r[f.col];
          const hij = toHijri(iso);
          row.appendChild(el("td", null, iso ? `${fmtDate(iso)}${hij ? `<div class="hint" style="font-size:11px;color:var(--muted)">${hij} هـ</div>` : ""}` : "—"));
          row.appendChild(el("td", "live-days", iso ? daysText(daysUntil(iso)) : "—"));
          row.appendChild(el("td", "live-badge", iso ? badge(iso) : "—"));
        } else {
          row.appendChild(el("td", null, escapeHtml(r[f.col] ?? "—")));
        }
      }
      const act = el("td");
      act.appendChild(this.rowActions(r, edit));
      row.appendChild(act);
      tb.appendChild(row);
    }
    tbl.appendChild(tb);
    return tbl;
  }

  rowActions(r, edit) {
    const box = el("div", "row-actions");
    const fileBtn = el("button", "icon-btn icon-file", "📎");
    fileBtn.title = "المرفقات";
    fileBtn.onclick = () => this.openAttachments(r);
    box.appendChild(fileBtn);
    if (edit) {
      const e = el("button", "icon-btn icon-edit", "✎");
      e.title = "تعديل"; e.onclick = () => this.openForm(r);
      const d = el("button", "icon-btn icon-del", "🗑");
      d.title = "حذف"; d.onclick = () => this.remove(r);
      box.appendChild(e); box.appendChild(d);
    }
    return box;
  }

  // ---------- نموذج إضافة/تعديل ----------
  openForm(r) {
    const isEdit = !!r;
    const fields = this.def.fields.map((f) => {
      const val = r ? (r[f.col] ?? "") : "";
      if (f.type === "companyRef") {
        const cur = r ? r.company_id : "";
        const opts = ['<option value="">—</option>']
          .concat(store.companies.map((co) => `<option value="${co.id}" ${co.id == cur ? "selected" : ""}>${escapeHtml(co.name)}</option>`))
          .join("");
        return `<div class="form-field"><label>${escapeHtml(f.header)}</label><select data-col="company_id">${opts}</select></div>`;
      }
      if (f.type === "date") {
        return `<div class="form-field"><label>${escapeHtml(f.header)}</label>
          <input type="date" data-col="${f.col}" value="${escapeHtml(String(val).slice(0,10))}" data-hijri>
          <div class="hint hijri-out"></div></div>`;
      }
      if (f.col === "notes") {
        return `<div class="form-field"><label>${escapeHtml(f.header)}</label><textarea data-col="${f.col}" rows="2">${escapeHtml(val)}</textarea></div>`;
      }
      return `<div class="form-field"><label>${escapeHtml(f.header)}${f.required ? ' <span class="req">*</span>' : ""}</label>
        <input type="text" data-col="${f.col}" value="${escapeHtml(val)}"></div>`;
    }).join("");

    openModal(`
      <h3>${isEdit ? "تعديل" : "إضافة"} — ${escapeHtml(this.def.label || "")}</h3>
      <div class="body">${fields}</div>
      <div class="foot">
        <button class="btn btn-primary" id="save">${isEdit ? "حفظ" : "إضافة"}</button>
        <button class="btn btn-ghost" id="cancel">إلغاء</button>
      </div>`);

    // عرض الهجري حياً أسفل حقول التاريخ
    $$("input[data-hijri]").forEach((inp) => {
      const out = inp.parentElement.querySelector(".hijri-out");
      const upd = () => { out.textContent = inp.value ? `${toHijri(inp.value)} هـ` : ""; };
      inp.oninput = upd; upd();
    });

    $("#cancel").onclick = closeModal;
    $("#save").onclick = () => this.save(r);
  }

  async save(r) {
    const body = {};
    $$("#modal [data-col]").forEach((inp) => { body[inp.dataset.col] = inp.value; });
    try {
      if (r) await api.update(this.entity, r.id, body);
      else await api.create(this.entity, body);
      closeModal();
      toast(r ? "تم الحفظ" : "تمت الإضافة", "ok");
      if (this.entity === "companies") await refreshCompanies();
      await this.reload();
    } catch (e) {
      toast(e.message, "err", 5000);
    }
  }

  async remove(r) {
    const label = r.name || r.title || r.plate_number || r.type || `#${r.id}`;
    if (!(await confirmDialog(`حذف السجل «${label}»؟ لا يمكن التراجع.`))) return;
    try {
      await api.remove(this.entity, r.id);
      toast("تم الحذف", "ok");
      if (this.entity === "companies") await refreshCompanies();
      await this.reload();
    } catch (e) { toast(e.message, "err"); }
  }

  // ---------- تصدير Excel ----------
  async exportExcel() {
    try {
      const res = await api.export(this.entity);
      const ws = XLSX.utils.json_to_sheet(res.rows, { header: res.headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, (res.label || this.entity).slice(0, 31));
      XLSX.writeFile(wb, `mahalliah-${this.entity}.xlsx`);
    } catch (e) { toast("تعذّر التصدير: " + e.message, "err"); }
  }

  // ---------- استيراد Excel ----------
  openImport() {
    const headers = this.def.fields.map((f) => f.header);
    openModal(`
      <h3>استيراد Excel — ${escapeHtml(this.def.label || "")}</h3>
      <div class="body">
        <p style="margin:0 0 6px">اختر ملف Excel بالأعمدة التالية (يُطابق تصدير النظام):</p>
        <div class="hint">${headers.map(escapeHtml).join(" · ")}</div>
        <input type="file" id="xlf" accept=".xlsx,.xls,.csv">
        <div id="imp-result"></div>
      </div>
      <div class="foot"><button class="btn btn-ghost" id="close">إغلاق</button></div>`);
    $("#close").onclick = closeModal;
    $("#xlf").onchange = (e) => this.handleImportFile(e.target.files[0]);
  }

  async handleImportFile(file) {
    if (!file) return;
    const box = $("#imp-result");
    box.innerHTML = `<div class="loading">جارٍ القراءة…</div>`;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { box.innerHTML = `<p class="rr">الملف فارغ</p>`; return; }
      const res = await api.import(this.entity, rows);
      box.innerHTML = this.importSummaryHtml(res);
      if (this.entity === "companies") await refreshCompanies();
      await this.reload();
      // نبقي النافذة مفتوحة لعرض الملخّص، لكن نحدّث الجدول خلفها
      this.render();
      if (res.acceptedCount) toast(`تمت إضافة ${res.acceptedCount} سجل`, "ok");
    } catch (e) {
      box.innerHTML = `<p class="rr" style="color:var(--danger)">تعذّرت المعالجة: ${escapeHtml(e.message)}</p>`;
    }
  }

  importSummaryHtml(res) {
    const rej = (res.rejected || []).map((x) =>
      `<div class="item"><span class="rn">صف ${x.row}</span><span class="rr">${escapeHtml(x.reason)}</span></div>`
    ).join("");
    return `<div class="import-summary">
      <div class="nums">
        <span class="a">مقبول: ${res.acceptedCount}</span>
        <span class="r">مرفوض: ${res.rejectedCount}</span>
        <span>الإجمالي: ${res.total}</span>
      </div>
      ${res.rejectedCount ? `<div class="reject-list">${rej}</div>` : `<div class="hint">تمت إضافة كل الصفوف بلا تكرارات.</div>`}
    </div>`;
  }

  // ---------- المرفقات ----------
  async openAttachments(r) {
    const edit = canEdit();
    openModal(`
      <h3>مرفقات السجل</h3>
      <div class="body">
        ${edit ? `<input type="file" id="af"><button class="btn btn-primary btn-sm" id="up">رفع</button>` : ""}
        <div id="att-list"><div class="loading">جارٍ التحميل…</div></div>
      </div>
      <div class="foot"><button class="btn btn-ghost" id="close">إغلاق</button></div>`);
    $("#close").onclick = closeModal;
    const load = async () => {
      const res = await api.listAttach(this.entity, r.id);
      const list = res.data || [];
      $("#att-list").innerHTML = list.length
        ? list.map((a) => `<div class="item" style="display:flex;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--line)">
            <a href="/api/attachments/${a.id}" target="_blank" style="flex:1;color:var(--brand-dark)">📄 ${escapeHtml(a.filename)}</a>
            <span class="hint">${Math.round((a.size||0)/1024)} كب</span>
            ${edit ? `<button class="icon-btn icon-del" data-del="${a.id}">🗑</button>` : ""}
          </div>`).join("")
        : `<div class="hint">لا مرفقات.</div>`;
      $$("[data-del]").forEach((b) => b.onclick = async () => {
        await api.removeAttach(b.dataset.del); toast("حُذف المرفق", "ok"); load();
      });
    };
    await load();
    if (edit) $("#up").onclick = async () => {
      const f = $("#af").files[0];
      if (!f) return;
      const fd = new FormData();
      fd.append("file", f); fd.append("entity_type", this.entity); fd.append("entity_id", r.id);
      try { await api.uploadAttach(fd); toast("تم الرفع", "ok"); $("#af").value = ""; load(); }
      catch (e) { toast(e.message, "err"); }
    };
  }

  // تحديث حي للأعمدة الزمنية دون إعادة تحميل
  tickLive() {
    if (!this.container) return;
    const trs = $$("tbody tr", this.container);
    for (const tr of trs) {
      const r = this.filtered.find((x) => x.id == tr.dataset.id);
      if (!r) continue;
      const dcells = tr.querySelectorAll(".live-days");
      const bcells = tr.querySelectorAll(".live-badge");
      let i = 0;
      for (const f of this.def.fields) {
        if (f.type === "date") {
          const iso = r[f.col];
          if (dcells[i]) dcells[i].textContent = iso ? daysText(daysUntil(iso)) : "—";
          if (bcells[i]) bcells[i].innerHTML = iso ? badge(iso) : "—";
          i++;
        }
      }
    }
  }
}
