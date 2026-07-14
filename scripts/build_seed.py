#!/usr/bin/env python3
"""يحوّل data/data.json الحالي إلى migrations/0002_seed.sql لتشغيله على D1.
يبني الشركات أولاً ثم يربط الموظفين/التراخيص/المركبات بها عبر معرّفاتها."""
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
data = json.load(open(os.path.join(ROOT, 'data', 'data.json'), encoding='utf-8'))

def q(v):
    """اقتباس آمن لقيمة نصية في SQL."""
    if v is None:
        return 'NULL'
    s = str(v).replace("'", "''")
    return "'" + s + "'"

def qn(v):
    """قيمة نصية اختيارية: فارغ → NULL."""
    if v is None or str(v).strip() == '':
        return 'NULL'
    return q(v)

lines = []
lines.append("-- بذر بيانات المتابعة الأولية (مولّد آلياً من data/data.json)")
lines.append("PRAGMA foreign_keys = ON;")
lines.append("")

# ---------- الشركات ----------
# نجمع أسماء الشركات الموحّدة من كل الأوراق، ونستخرج رقم المنشأة من نص الترخيص إن وجد.
mol_by_company = {}
for lic in data['licenses']:
    raw = lic.get('company', '')
    norm = lic.get('company_norm')
    m = re.search(r'\(\s*([\d\-]+)\s*\)', raw)
    if norm and m:
        mol_by_company.setdefault(norm, m.group(1))

companies = []
for grp in ('licenses', 'employees' if 'employees' in data else 'iqamas', 'vehicles'):
    for r in data.get(grp, []):
        c = r.get('company_norm')
        if c and c not in companies:
            companies.append(c)

# أرقام سجلات تجارية معروفة غير متوفّرة في المصدر → تُترك فارغة (NULL) لتُدخل لاحقاً
lines.append("-- الشركات / المنشآت")
comp_id = {}
for i, c in enumerate(companies, start=1):
    comp_id[c] = i
    mol = mol_by_company.get(c)
    lines.append(
        f"INSERT INTO companies (id, name, cr_number, mol_number, notes) "
        f"VALUES ({i}, {q(c)}, NULL, {qn(mol)}, '');"
    )
lines.append("")

def cid(company_norm):
    return comp_id.get(company_norm, 'NULL')

# ---------- الموظفون / الإقامات ----------
lines.append("-- الموظفون / الإقامات")
iqamas = data.get('iqamas', data.get('employees', []))
seen_iqama = set()
for r in iqamas:
    num = str(r.get('number', '')).strip()
    if not num or num in seen_iqama:
        continue  # تخطّي التكرار في المصدر (القيد الفريد يمنعه أصلاً)
    seen_iqama.add(num)
    lines.append(
        "INSERT INTO employees (name, iqama_number, company_id, iqama_expiry, notes) "
        f"VALUES ({q(r.get('name'))}, {q(num)}, {cid(r.get('company_norm'))}, "
        f"{qn(r.get('expiry'))}, '');"
    )
lines.append("")

# ---------- التراخيص ----------
lines.append("-- التراخيص والسجلات")
seen_lic = set()
for r in data.get('licenses', []):
    title = str(r.get('item', '')).strip()
    if not title:
        continue
    key = (r.get('company_norm'), title)
    if key in seen_lic:
        continue
    seen_lic.add(key)
    recurring = ''
    status = r.get('status')
    if status == 'recurring':
        recurring = r.get('expiry_text', '') or 'متكرر شهرياً'
    lines.append(
        "INSERT INTO licenses (company_id, title, license_number, issuer, expiry, hijri_expiry, recurring_note, notes) "
        f"VALUES ({cid(r.get('company_norm'))}, {q(title)}, NULL, {q(r.get('platform',''))}, "
        f"{qn(r.get('expiry'))}, {q(r.get('hijri',''))}, {q(recurring)}, {q(r.get('notes',''))});"
    )
lines.append("")

# ---------- المركبات ----------
lines.append("-- المركبات")
seen_plate = set()
for r in data.get('vehicles', []):
    plate = str(r.get('plate', '')).strip()
    if not plate or plate in seen_plate:
        continue
    seen_plate.add(plate)
    lines.append(
        "INSERT INTO vehicles (type, plate_number, company_id, form_expiry, form_expiry_hijri, "
        "inspection_expiry, inspection_expiry_hijri, condition, notes) "
        f"VALUES ({q(r.get('type'))}, {q(plate)}, {cid(r.get('company_norm'))}, "
        f"{qn(r.get('form_expiry'))}, {q(r.get('form_hijri',''))}, "
        f"{qn(r.get('insp_expiry'))}, {q(r.get('insp_hijri',''))}, "
        f"{q(r.get('condition',''))}, '');"
    )
lines.append("")

# ---------- المنصات ----------
lines.append("-- المنصات والأنظمة")
seen_pf = set()
for name in data.get('platforms', []):
    nm = str(name).strip()
    if not nm or nm in seen_pf:
        continue
    seen_pf.add(nm)
    lines.append(f"INSERT INTO platforms (name, entity, notes) VALUES ({q(nm)}, '', '');")
lines.append("")

out = os.path.join(ROOT, 'migrations', '0002_seed.sql')
open(out, 'w', encoding='utf-8').write("\n".join(lines) + "\n")
print(f"wrote {out}")
print(f"companies={len(companies)} employees={len(seen_iqama)} "
      f"licenses={len(seen_lic)} vehicles={len(seen_plate)} platforms={len(seen_pf)}")
