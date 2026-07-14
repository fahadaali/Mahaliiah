#!/usr/bin/env bash
# اختبار دخان سريع لواجهة الـAPI محلياً (يتطلب: npm run dev قيد التشغيل مع DEV_BYPASS_AUTH=true)
# الاستخدام: bash scripts/smoke.sh [BASE_URL]
set -euo pipefail
B="${1:-http://127.0.0.1:8788}"

echo "== الهوية =="
curl -s "$B/api/me"; echo

echo "== إضافة موظف جديد =="
curl -s -X POST "$B/api/e/employees" -H 'Content-Type: application/json' \
  -d '{"name":"اختبار دخان","iqama_number":"9000000001","company_id":1,"iqama_expiry":"2026-12-01"}' -w " [%{http_code}]\n"

echo "== رفض إقامة مكرّرة (متوقع 409) =="
curl -s -X POST "$B/api/e/employees" -H 'Content-Type: application/json' \
  -d '{"name":"مكرر","iqama_number":"9000000001"}' -w " [%{http_code}]\n"

echo "== استيراد فيه تكرارات (متوقع مقبول=1 مرفوض=2) =="
curl -s -X POST "$B/api/e/employees/import" -H 'Content-Type: application/json' -d '{
  "rows":[
    {"اسم الموظف":"مقبول","رقم الإقامة":"9000000002"},
    {"اسم الموظف":"مكرر قاعدة","رقم الإقامة":"9000000001"},
    {"اسم الموظف":"بلا رقم"}
  ]}'; echo

echo "== منع المطّلع من الكتابة (متوقع 403) =="
curl -s -X POST "$B/api/e/platforms" -H 'X-Dev-Email: smoke-viewer@test.com' \
  -H 'Content-Type: application/json' -d '{"name":"x"}' -w " [%{http_code}]\n"

echo "== تم =="
