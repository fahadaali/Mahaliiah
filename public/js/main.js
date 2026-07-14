// نقطة انطلاق التطبيق — تحميل الهوية والبيانات الوصفية، بناء التنقّل والتوجيه

import { api } from "./api.js";
import { store, isAdmin } from "./store.js";
import { $, el, toast } from "./util.js";
import { DashboardView } from "./dashboard.js";
import { EntityView } from "./entity.js";
import { AuditView, UsersView } from "./admin.js";

const ROLE_AR = { admin: "مسؤول", editor: "محرّر", viewer: "مطّلع" };
let current = null;      // العرض الحالي (يملك tickLive)
let liveTimer = null;

const NAV = [
  { id: "dashboard", label: "لوحة القيادة" },
  { id: "licenses", label: "التراخيص", entity: "licenses" },
  { id: "employees", label: "الإقامات", entity: "employees" },
  { id: "vehicles", label: "المركبات", entity: "vehicles" },
  { id: "companies", label: "الشركات", entity: "companies" },
  { id: "platforms", label: "المنصات والأنظمة", entity: "platforms" },
  { id: "audit", label: "سجل التدقيق", admin: true },
  { id: "users", label: "المستخدمون", admin: true },
];

async function boot() {
  try {
    store.user = await api.me();
    store.meta = (await api.meta()).entities;
  } catch (e) {
    $("#main").innerHTML = `<div class="loading" style="color:var(--danger)">
      تعذّر تسجيل الدخول: ${e.message}<br><br>
      تأكّد من الدخول عبر Cloudflare Access.</div>`;
    return;
  }

  // شريط المستخدم
  $("#userbox").innerHTML = `<b>${store.user.name || store.user.email}</b><br>
    <span class="role-badge">${ROLE_AR[store.user.role] || store.user.role}</span>`;

  // التنقّل
  const nav = $("#nav");
  nav.innerHTML = "";
  NAV.filter((n) => !n.admin || isAdmin()).forEach((n) => {
    const b = el("button", null, n.label);
    b.dataset.id = n.id;
    b.onclick = () => route(n.id);
    nav.appendChild(b);
  });

  // مؤقّت التحديث الحي (كل 30 ثانية يُعيد حساب المدد المتناقصة)
  liveTimer = setInterval(() => { if (current && current.tickLive) current.tickLive(); }, 30000);

  route("dashboard");
}

async function route(id) {
  const nav = $("#nav");
  Array.from(nav.children).forEach((b) => b.classList.toggle("active", b.dataset.id === id));
  const main = $("#main");
  main.innerHTML = "";
  const holder = el("div", "view active");
  main.appendChild(holder);

  const item = NAV.find((n) => n.id === id);
  try {
    if (id === "dashboard") current = new DashboardView();
    else if (id === "audit") current = new AuditView();
    else if (id === "users") current = new UsersView();
    else if (item && item.entity) {
      const def = store.meta[item.entity];
      current = new EntityView(item.entity, def);
    }
    await current.mount(holder);
  } catch (e) {
    holder.innerHTML = `<div class="loading" style="color:var(--danger)">تعذّر التحميل: ${e.message}</div>`;
  }
}

boot();
