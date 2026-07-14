// غلاف الاتصال بواجهة الـAPI

async function req(method, path, body, isForm = false) {
  const opts = { method, headers: {} };
  if (body != null) {
    if (isForm) opts.body = body;
    else { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(body); }
  }
  const res = await fetch(path, opts);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const msg = (data && data.error) || `خطأ ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  me:      () => req("GET", "/api/me"),
  meta:    () => req("GET", "/api/meta"),
  alerts:  (win = 90) => req("GET", `/api/alerts?window=${win}`),
  list:    (entity) => req("GET", `/api/e/${entity}`),
  create:  (entity, body) => req("POST", `/api/e/${entity}`, body),
  update:  (entity, id, body) => req("PUT", `/api/e/${entity}/${id}`, body),
  remove:  (entity, id) => req("DELETE", `/api/e/${entity}/${id}`),
  export:  (entity) => req("GET", `/api/e/${entity}/export`),
  import:  (entity, rows) => req("POST", `/api/e/${entity}/import`, { rows }),
  // مرفقات
  listAttach: (type, id) => req("GET", `/api/attachments?entity_type=${type}&entity_id=${id}`),
  uploadAttach: (form) => req("POST", "/api/attachments", form, true),
  removeAttach: (id) => req("DELETE", `/api/attachments/${id}`),
  // إدارة
  audit:   () => req("GET", "/api/audit"),
  users:   () => req("GET", "/api/users"),
  saveUser:(body) => req("POST", "/api/users", body),
  removeUser:(email) => req("DELETE", `/api/users/${encodeURIComponent(email)}`),
};
