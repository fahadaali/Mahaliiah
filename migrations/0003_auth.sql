-- ============================================================
-- نظام تسجيل دخول مبسّط (بريد + كلمة مرور) بدل Cloudflare Access
-- كلمة المرور الافتراضية للحسابات الجديدة: 1234 (password_hash فارغ)،
-- ويُجبر المستخدم على تعيين كلمة مرور جديدة عند أول دخول (must_change=1).
-- ============================================================

ALTER TABLE users ADD COLUMN password_hash TEXT;
ALTER TABLE users ADD COLUMN must_change INTEGER NOT NULL DEFAULT 1;

-- جلسات الدخول (رمز عشوائي مخزّن، يُحذف عند تسجيل الخروج أو انتهاء الصلاحية)
CREATE TABLE IF NOT EXISTS sessions (
  token       TEXT PRIMARY KEY,
  email       TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
