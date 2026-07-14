// حالة مشتركة: المستخدم، البيانات الوصفية، قائمة الشركات (للقوائم المنسدلة)

import { api } from "./api.js";

export const store = {
  user: null,      // {email,name,role}
  meta: null,      // {entities:{...}}
  companies: [],   // [{id,name}]
};

export function canEdit() {
  return store.user && (store.user.role === "admin" || store.user.role === "editor");
}
export function isAdmin() {
  return store.user && store.user.role === "admin";
}

export async function refreshCompanies() {
  const res = await api.list("companies");
  store.companies = (res.data || []).map((c) => ({ id: c.id, name: c.name }));
  return store.companies;
}

export function companyName(id) {
  if (!id) return "";
  const c = store.companies.find((x) => x.id === id);
  return c ? c.name : "";
}
