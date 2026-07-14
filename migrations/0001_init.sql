-- ============================================================
-- منصة المحلية · mahalliah — مخطط قاعدة البيانات (D1 / SQLite)
-- كل التواريخ الميلادية تُخزّن نصاً ISO (YYYY-MM-DD) كمصدر وحيد للحقيقة.
-- الهجري يُخزّن نصاً للعرض فقط.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- الشركات / المنشآت ----------
CREATE TABLE IF NOT EXISTS companies (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT    NOT NULL,
  cr_number    TEXT    UNIQUE,            -- رقم السجل التجاري (فريد)
  mol_number   TEXT    UNIQUE,            -- رقم المنشأة في وزارة الموارد البشرية (فريد)
  notes        TEXT    DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- الموظفون / الإقامات ----------
CREATE TABLE IF NOT EXISTS employees (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT    NOT NULL,
  iqama_number  TEXT    NOT NULL UNIQUE,  -- رقم الإقامة/الهوية (فريد)
  company_id    INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  iqama_expiry  TEXT,                     -- ISO date
  notes         TEXT    DEFAULT '',
  created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_employees_company ON employees(company_id);
CREATE INDEX IF NOT EXISTS idx_employees_expiry  ON employees(iqama_expiry);

-- ---------- التراخيص والسجلات ----------
CREATE TABLE IF NOT EXISTS licenses (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  company_id      INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  title           TEXT    NOT NULL,       -- البيان
  license_number  TEXT    UNIQUE,         -- رقم الترخيص (فريد عند وجوده)
  issuer          TEXT    DEFAULT '',      -- الجهة / المنصة
  expiry          TEXT,                    -- ISO date (ميلادي)
  hijri_expiry    TEXT    DEFAULT '',      -- نص هجري للعرض
  recurring_note  TEXT    DEFAULT '',      -- للبنود المتكررة (مثل: 25 من كل شهر)
  notes           TEXT    DEFAULT '',
  created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_licenses_company ON licenses(company_id);
CREATE INDEX IF NOT EXISTS idx_licenses_expiry  ON licenses(expiry);
-- فرادة مركّبة احتياطية عند غياب رقم الترخيص: (الشركة + البيان)
CREATE UNIQUE INDEX IF NOT EXISTS uq_licenses_company_title ON licenses(company_id, title);

-- ---------- المركبات ----------
CREATE TABLE IF NOT EXISTS vehicles (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  type                   TEXT    NOT NULL,   -- نوع المركبة
  plate_number           TEXT    NOT NULL UNIQUE, -- رقم اللوحة (فريد)
  company_id             INTEGER REFERENCES companies(id) ON DELETE SET NULL,
  form_expiry            TEXT,               -- ISO date — انتهاء الاستمارة
  form_expiry_hijri      TEXT    DEFAULT '',
  inspection_expiry      TEXT,               -- ISO date — انتهاء الفحص الدوري
  inspection_expiry_hijri TEXT   DEFAULT '',
  condition              TEXT    DEFAULT '', -- حالة المركبة
  notes                  TEXT    DEFAULT '',
  created_at             TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at             TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vehicles_company ON vehicles(company_id);

-- ---------- المنصات والأنظمة ----------
CREATE TABLE IF NOT EXISTS platforms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT    NOT NULL UNIQUE,     -- اسم الجهة/النظام (فريد)
  entity      TEXT    DEFAULT '',           -- الشركة/الجهة المرتبطة
  notes       TEXT    DEFAULT '',
  created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- المستخدمون والأدوار ----------
CREATE TABLE IF NOT EXISTS users (
  email       TEXT    PRIMARY KEY,
  name        TEXT    DEFAULT '',
  role        TEXT    NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin','editor','viewer')),
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

-- ---------- المرفقات (R2) ----------
CREATE TABLE IF NOT EXISTS attachments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type   TEXT    NOT NULL,           -- companies|employees|licenses|vehicles|platforms
  entity_id     INTEGER NOT NULL,
  r2_key        TEXT    NOT NULL UNIQUE,
  filename      TEXT    NOT NULL,
  content_type  TEXT    DEFAULT '',
  size          INTEGER DEFAULT 0,
  uploaded_by   TEXT    DEFAULT '',
  uploaded_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attach_entity ON attachments(entity_type, entity_id);

-- ---------- سجل التدقيق ----------
CREATE TABLE IF NOT EXISTS audit_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email   TEXT    DEFAULT '',
  action       TEXT    NOT NULL,            -- create|update|delete|import|role_change
  entity_type  TEXT    NOT NULL,
  entity_id    INTEGER,
  changes_json TEXT    DEFAULT '',
  created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
