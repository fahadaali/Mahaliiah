# دليل النشر — منصة المحلية على Cloudflare

هذا الدليل ينشر المنصة على **Cloudflare Workers** مع **D1** (قاعدة البيانات) و**R2** (المرفقات) و**Cloudflare Access** (المصادقة).
كل الأوامر تُنفَّذ من جذر المشروع بعد `npm install`.

## 0) المتطلّبات
- حساب Cloudflare + `npm install` منجز.
- تسجيل الدخول: `npx wrangler login`

## 1) إنشاء قاعدة البيانات D1
```bash
npx wrangler d1 create mahalliah-db
```
انسخ `database_id` الناتج وضعه في `wrangler.toml` مكان `REPLACE_WITH_D1_DATABASE_ID`.

## 2) إنشاء حاوية المرفقات R2
```bash
npx wrangler r2 bucket create mahalliah-docs
```

## 3) تطبيق المخطط وبذر البيانات
```bash
npm run db:migrate:remote     # ينشئ الجداول + يبذر البيانات الحالية (0001 + 0002)
```
> لإعادة توليد بذرة البيانات من ملف Excel محدّث: `python3 scripts/build_seed.py` ثم أعد الأمر أعلاه.
> إن أردت البدء بقاعدة فارغة، احذف `migrations/0002_seed.sql` قبل التطبيق.

## 4) إعداد Cloudflare Access (المصادقة)
من لوحة **Zero Trust → Access → Applications → Add an application → Self-hosted**:
1. **Application domain**: نطاق المنصة (مثال: `mahalliah.example.com` أو نطاق `*.workers.dev`).
2. **Identity providers**: فعّل One-time PIN (بريد) أو Google … إلخ.
3. **Policies**: أضف سياسة *Allow* تحصر الدخول ببُرد فريقك (Emails / Email domain).
4. بعد الإنشاء، من **Overview** انسخ:
   - **Application Audience (AUD) Tag** → ضعه في `ACCESS_AUD` بـ `wrangler.toml`.
   - نطاق فريقك `https://<team>.cloudflareaccess.com` → ضعه في `ACCESS_TEAM_DOMAIN`.
5. اضبط `BOOTSTRAP_ADMIN_EMAIL` على بريدك (يُمنح دور **مسؤول** تلقائياً عند أول دخول).
6. تأكّد أن `DEV_BYPASS_AUTH = "false"` في الإنتاج.

## 5) (اختياري) تنبيهات البريد
مهمة Cron اليومية ترسل بريداً للوثائق التي تنتهي خلال 30 يوماً عبر Resend:
```bash
npx wrangler secret put RESEND_API_KEY      # مفتاح Resend
npx wrangler secret put ALERT_TO_EMAILS      # بريد المستلمين مفصولاً بفواصل
```
> بدون هذه الأسرار، تظهر التنبيهات داخل اللوحة فقط (تعمل دائماً).

## 6) النشر
```bash
npm run deploy
```
ستحصل على رابط `https://mahalliah-platform.<your-subdomain>.workers.dev` — اربط تطبيق Access على هذا النطاق (خطوة 4).

## الأدوار والصلاحيات
- **مسؤول (admin)**: كل شيء + إدارة المستخدمين والأدوار + سجل التدقيق.
- **محرّر (editor)**: إضافة/تعديل/حذف/استيراد/رفع مرفقات.
- **مطّلع (viewer)**: عرض وتصدير فقط.

المستخدم الجديد الذي يدخل عبر Access يُنشأ كـ **مطّلع** افتراضياً، ثم يرفعه المسؤول من شاشة «المستخدمون».
يجب أن يطابق بريد المستخدم في الشاشة بريد دخوله في Access.

## قواعد رفض التكرار عند الاستيراد
| النوع | المفتاح الفريد |
|---|---|
| الموظفون | رقم الإقامة |
| الشركات | رقم السجل التجاري / رقم المنشأة |
| التراخيص | رقم الترخيص (أو الشركة + البيان) |
| المركبات | رقم اللوحة |
| المنصات | اسم الجهة |
يُرفض أي صف يكرّر سجلاً موجوداً في القاعدة أو يتكرّر داخل الملف نفسه، مع بيان السبب لكل صف.

## التطوير المحلي
```bash
npm run db:migrate:local     # يطبّق المخطط + البذرة على D1 محلي
npm run dev                  # يشغّل الخادم؛ .dev.vars يفعّل DEV_BYPASS_AUTH لتخطّي Access محلياً
npm test                     # اختبارات المنطق
```
في الوضع المحلي يمكن محاكاة مستخدم آخر بترويسة `X-Dev-Email: name@example.com`.
