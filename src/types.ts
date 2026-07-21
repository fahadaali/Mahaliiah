// أنواع البيئة والربط (Bindings) لمنصة المحلية

export interface Env {
  DB: D1Database;
  DOCS: R2Bucket;
  ASSETS: Fetcher;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  BOOTSTRAP_ADMIN_EMAIL: string;
  DEV_BYPASS_AUTH: string;
  RESEND_API_KEY?: string;
  ALERT_TO_EMAILS?: string;
}

export type Role = "admin" | "editor" | "viewer";

export interface CurrentUser {
  email: string;
  name: string;
  role: Role;
  must_change?: boolean;
}

// متغيّرات سياق Hono
export type Vars = {
  user: CurrentUser;
};
