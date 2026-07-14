// لوحة القيادة الحية — تُحسب المدد لحظياً من التاريخ الفعلي

import { api } from "./api.js";
import { $, el, escapeHtml, fmtDate, daysUntil, daysText, statusOf, STATUS, badge } from "./util.js";

export class DashboardView {
  constructor() { this.data = null; }

  async mount(container) {
    this.container = container;
    container.innerHTML = `<div class="loading">جارٍ تحميل اللوحة…</div>`;
    const [emp, lic, veh, pf, alerts] = await Promise.all([
      api.list("employees"), api.list("licenses"), api.list("vehicles"),
      api.list("platforms"), api.alerts(90),
    ]);
    this.data = {
      employees: emp.data || [], licenses: lic.data || [], vehicles: veh.data || [],
      platforms: pf.data || [], alerts: alerts.data || [],
    };
    this.render();
  }

  render() {
    const d = this.data;
    const c = this.container;
    c.innerHTML = `
      <div class="section-title" style="margin-top:18px"><span class="dot"></span> لوحة القيادة
        <span class="hint" style="font-weight:400;color:var(--muted)">تحديث حي<span class="live-dot"></span></span></div>
      <div class="kpis" id="kpis"></div>
      <div class="grid-3">
        <div class="panel"><h3>توزيع حالة الإقامات</h3>
          <div class="donut-wrap"><div class="donut"><div class="ring" id="donut"></div>
          <div class="center"><b id="donut-total">0</b><span>إقامة</span></div></div>
          <div class="legend" id="donut-legend"></div></div></div>
        <div class="panel"><h3>السجلات حسب الشركة</h3><div class="bars" id="company-bars"></div></div>
        <div class="panel"><h3>حالة المركبات (الاستمارة / الفحص)</h3><div class="bars" id="vehicle-bars"></div></div>
      </div>
      <div class="grid-2">
        <div class="panel"><h3>انتهاء الإقامات خلال 12 شهراً</h3><div class="tl" id="timeline"></div></div>
        <div class="panel"><h3>الأولويات — قريبة الانتهاء <span class="count-pill">(<span id="soon-count">0</span>)</span></h3>
          <div id="soon-list" style="max-height:230px;overflow:auto"></div></div>
      </div>`;
    this.renderKpis();
    this.renderDonut();
    this.renderCompanyBars();
    this.renderVehicles();
    this.renderTimeline();
    this.renderAlerts();
  }

  renderKpis() {
    const d = this.data;
    const soon = d.alerts.filter((a) => a.days >= 0 && a.days <= 90).length;
    const expired = d.alerts.filter((a) => a.days < 0).length;
    const cards = [
      { label: "التراخيص والسجلات", value: d.licenses.length, sub: "سجل", cls: "dark" },
      { label: "إقامات الموظفين", value: d.employees.length, sub: "موظف", cls: "" },
      { label: "المركبات", value: d.vehicles.length, sub: "مركبة", cls: "" },
      { label: "المنصات والأنظمة", value: d.platforms.length, sub: "نظام", cls: "dark" },
      { label: "قريبة الانتهاء (≤90 يوم)", value: soon, sub: "متابعة عاجلة", cls: "warn" },
      { label: "منتهية", value: expired, sub: "تجديد فوري", cls: "danger" },
    ];
    $("#kpis").innerHTML = cards.map((c) =>
      `<div class="kpi ${c.cls}"><div class="label">${c.label}</div><div class="value">${c.value}</div><div class="sub">${c.sub}</div></div>`
    ).join("");
  }

  renderDonut() {
    const counts = { valid: 0, soon: 0, expired: 0, none: 0 };
    this.data.employees.forEach((e) => counts[statusOf(e.iqama_expiry)]++);
    const total = this.data.employees.length || 1;
    const order = ["valid", "soon", "expired"];
    let acc = 0; const grad = [];
    order.forEach((k) => { if (counts[k] > 0) { const a = acc, b = acc + counts[k] / total * 100; grad.push(`${STATUS[k].color} ${a}% ${b}%`); acc = b; } });
    if (!grad.length) grad.push("var(--neutral-bg) 0% 100%");
    $("#donut").style.background = `conic-gradient(${grad.join(",")})`;
    $("#donut-total").textContent = this.data.employees.length;
    $("#donut-legend").innerHTML = [["valid", "ساري"], ["soon", "قريب الانتهاء"], ["expired", "منتهي"]]
      .map(([k, t]) => `<div class="li"><span class="sw" style="background:${STATUS[k].color}"></span>${t}
        <b style="margin-right:auto;color:var(--brand-dark)">${counts[k]}</b></div>`).join("");
  }

  renderCompanyBars() {
    const map = {};
    const add = (name) => { const n = name || "غير محدد"; map[n] = (map[n] || 0) + 1; };
    this.data.licenses.forEach((r) => add(r.company_name));
    this.data.employees.forEach((r) => add(r.company_name));
    this.data.vehicles.forEach((r) => add(r.company_name));
    const rows = Object.entries(map).sort((a, b) => b[1] - a[1]);
    const max = Math.max(1, ...rows.map((r) => r[1]));
    $("#company-bars").innerHTML = rows.length ? rows.map(([n, v]) =>
      `<div class="bar-row"><div class="name" title="${escapeHtml(n)}">${escapeHtml(n)}</div>
       <div class="bar-track"><div class="bar-fill" style="width:${v / max * 100}%"></div></div>
       <div class="num">${v}</div></div>`).join("") : `<div class="empty">لا بيانات</div>`;
  }

  renderVehicles() {
    const cats = [["الاستمارة", "form_expiry"], ["الفحص الدوري", "inspection_expiry"]];
    const keys = ["valid", "soon", "expired", "none"];
    const V = this.data.vehicles;
    $("#vehicle-bars").innerHTML = cats.map(([label, fld]) => {
      const c = { valid: 0, soon: 0, expired: 0, none: 0 };
      V.forEach((r) => c[statusOf(r[fld])]++);
      const total = V.length || 1;
      const segs = keys.filter((k) => c[k] > 0).map((k) =>
        `<div title="${STATUS[k].ar}: ${c[k]}" style="height:100%;width:${c[k] / total * 100}%;background:${STATUS[k].color}"></div>`).join("");
      return `<div class="bar-row"><div class="name">${label}</div>
        <div class="bar-track" style="display:flex">${segs}</div><div class="num">${V.length}</div></div>`;
    }).join("");
  }

  renderTimeline() {
    const months = [];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const dt = new Date(now.getFullYear(), now.getMonth() + i, 1);
      months.push({ key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`,
        lbl: dt.toLocaleDateString("ar-EG", { month: "short" }), valid: 0, soon: 0, expired: 0 });
    }
    this.data.employees.forEach((e) => {
      if (!e.iqama_expiry) return;
      const m = months.find((x) => x.key === String(e.iqama_expiry).slice(0, 7));
      if (m) m[statusOf(e.iqama_expiry)]++;
    });
    const max = Math.max(1, ...months.map((m) => m.valid + m.soon + m.expired));
    $("#timeline").innerHTML = months.map((m) => {
      const tot = m.valid + m.soon + m.expired;
      const segs = ["expired", "soon", "valid"].filter((k) => m[k] > 0)
        .map((k) => `<div class="seg" title="${STATUS[k].ar}: ${m[k]}" style="flex:${m[k]};background:${STATUS[k].color}"></div>`).join("");
      return `<div class="col"><div class="tot">${tot || ""}</div>
        <div class="stack" style="height:${tot / max * 100}%">${segs}</div><div class="lbl">${m.lbl}</div></div>`;
    }).join("");
  }

  renderAlerts() {
    const items = this.data.alerts.slice().sort((a, b) => a.days - b.days);
    $("#soon-count").textContent = items.length;
    const box = $("#soon-list");
    if (!items.length) { box.innerHTML = `<div class="empty">لا عناصر قريبة الانتهاء 🎉</div>`; return; }
    const tbl = el("table");
    tbl.innerHTML = `<thead><tr><th>النوع</th><th>البيان</th><th>الشركة</th><th>الانتهاء</th><th>المتبقّي</th></tr></thead>`;
    const tb = el("tbody");
    items.slice(0, 60).forEach((it) => {
      const s = STATUS[it.days < 0 ? "expired" : "soon"];
      tb.appendChild(el("tr", null,
        `<td><span class="badge b-neutral">${it.type}</span></td><td>${escapeHtml(it.name)}</td>
         <td>${escapeHtml(it.company)}</td><td>${fmtDate(it.expiry)}</td>
         <td><span class="badge ${s.cls}">${daysText(it.days)}</span></td>`));
    });
    tbl.appendChild(tb); box.innerHTML = ""; box.appendChild(tbl);
  }

  tickLive() {
    // إعادة حساب الحالات الحية (العدّاد يتناقص) دون نداء الشبكة
    if (!this.container || !this.data) return;
    this.renderKpis();
    this.renderDonut();
    this.renderVehicles();
    this.renderAlerts();
  }
}
