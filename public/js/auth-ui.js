// شاشات تسجيل الدخول وتعيين كلمة المرور

import { api } from "./api.js";
import { $, el } from "./util.js";

function shell(inner) {
  $("#nav").innerHTML = "";
  $("#userbox").innerHTML = "";
  const lo = $("#logout-btn");
  if (lo) lo.style.display = "none";
  $("#main").innerHTML = `<div class="auth-wrap">${inner}</div>`;
}

/** شاشة تسجيل الدخول. onDone يُستدعى بعد نجاح الدخول. */
export function renderLogin(onDone) {
  shell(`
    <form class="auth-card" id="login-form">
      <img class="auth-logo" src="logo.jpg" alt="المحلية">
      <h2>تسجيل الدخول</h2>
      <p class="auth-sub">منصة المحلية · mahalliah</p>
      <div class="form-field"><label>البريد الإلكتروني</label>
        <input type="email" id="l-email" autocomplete="username" placeholder="name@example.com" required></div>
      <div class="form-field"><label>كلمة المرور</label>
        <input type="password" id="l-pass" autocomplete="current-password" placeholder="••••" required></div>
      <button class="btn btn-primary" id="l-btn" type="submit">دخول</button>
      <div class="auth-err" id="l-err"></div>
    </form>`);
  $("#l-email").focus();
  $("#login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = $("#l-btn"), err = $("#l-err");
    err.textContent = ""; btn.disabled = true; btn.textContent = "جارٍ الدخول…";
    try {
      await api.login($("#l-email").value.trim(), $("#l-pass").value);
      onDone();
    } catch (ex) {
      err.textContent = ex.message; btn.disabled = false; btn.textContent = "دخول";
    }
  });
}

/** شاشة تعيين كلمة مرور جديدة (أول دخول). */
export function renderChangePassword(onDone) {
  shell(`
    <form class="auth-card" id="cp-form">
      <img class="auth-logo" src="logo.jpg" alt="المحلية">
      <h2>تعيين كلمة مرور جديدة</h2>
      <p class="auth-sub">هذا أول دخول لك — يرجى اختيار كلمة مرور خاصة بك.</p>
      <div class="form-field"><label>كلمة المرور الجديدة</label>
        <input type="password" id="cp-1" autocomplete="new-password" placeholder="4 أحرف على الأقل" required></div>
      <div class="form-field"><label>تأكيد كلمة المرور</label>
        <input type="password" id="cp-2" autocomplete="new-password" required></div>
      <button class="btn btn-primary" id="cp-btn" type="submit">حفظ ومتابعة</button>
      <div class="auth-err" id="cp-err"></div>
    </form>`);
  $("#cp-1").focus();
  $("#cp-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const err = $("#cp-err"), btn = $("#cp-btn");
    const p1 = $("#cp-1").value, p2 = $("#cp-2").value;
    err.textContent = "";
    if (p1 !== p2) { err.textContent = "كلمتا المرور غير متطابقتين"; return; }
    if (p1.length < 4) { err.textContent = "كلمة المرور قصيرة (4 أحرف على الأقل)"; return; }
    btn.disabled = true; btn.textContent = "جارٍ الحفظ…";
    try {
      await api.changePassword(p1);
      onDone();
    } catch (ex) {
      err.textContent = ex.message; btn.disabled = false; btn.textContent = "حفظ ومتابعة";
    }
  });
}
