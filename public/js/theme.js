// تبديل الوضع الداكن/الفاتح مع الحفظ في المتصفّح

export function initTheme() {
  const btn = document.getElementById("theme-toggle");
  const root = document.documentElement;
  const apply = (t) => {
    root.setAttribute("data-theme", t);
    if (btn) btn.textContent = t === "dark" ? "☀️" : "🌙";
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#0b1206" : "#eef1e6");
  };
  let cur = root.getAttribute("data-theme") || "light";
  apply(cur);
  if (btn) btn.onclick = () => {
    cur = cur === "dark" ? "light" : "dark";
    try { localStorage.setItem("mah-theme", cur); } catch (e) {}
    apply(cur);
  };
}
