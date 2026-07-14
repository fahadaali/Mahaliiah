// اختبارات وحدة للمنطق النقي: تطبيع التواريخ ومفاتيح كشف التكرار

import { describe, it, expect } from "vitest";
import { normalizeDate } from "../src/validate";
import { batchKey } from "../src/dedup";
import { ENTITIES } from "../src/entities";

describe("normalizeDate", () => {
  it("يقبل ISO", () => expect(normalizeDate("2026-09-28")).toBe("2026-09-28"));
  it("يحوّل dd/mm/yyyy", () => expect(normalizeDate("05/07/2026")).toBe("2026-07-05"));
  it("يكمّل الأصفار", () => expect(normalizeDate("2026-7-5")).toBe("2026-07-05"));
  it("يُرجع null للفارغ", () => expect(normalizeDate("")).toBeNull());
  it("يُرجع null لغير القابل للتحليل", () => expect(normalizeDate("غير تاريخ")).toBeNull());
});

describe("batchKey — كشف التكرار داخل الملف", () => {
  it("employees: يعتمد رقم الإقامة", () => {
    const k = batchKey(ENTITIES.employees, { iqama_number: "2325590459", name: "س" });
    expect(k).toBe("iqama_number:2325590459");
  });
  it("vehicles: يعتمد رقم اللوحة", () => {
    const k = batchKey(ENTITIES.vehicles, { plate_number: "ب ب م 6580" });
    expect(k).toBe("plate_number:ب ب م 6580");
  });
  it("licenses: يستخدم المفتاح المركّب عند غياب رقم الترخيص", () => {
    const k = batchKey(ENTITIES.licenses, { license_number: "", company_id: 1, title: "ترخيص بلدي" });
    expect(k).toBe("company_id+title:1|ترخيص بلدي");
  });
  it("licenses: يفضّل رقم الترخيص عند وجوده", () => {
    const k = batchKey(ENTITIES.licenses, { license_number: "LIC-9", company_id: 1, title: "ت" });
    expect(k).toBe("license_number:LIC-9");
  });
  it("يُرجع null عند غياب أي مفتاح", () => {
    expect(batchKey(ENTITIES.employees, { name: "بلا رقم" })).toBeNull();
  });
});

describe("تعريفات الكيانات", () => {
  it("كل كيان له مفتاح فرادة واحد على الأقل", () => {
    for (const def of Object.values(ENTITIES)) {
      expect(def.uniqueKeys.length).toBeGreaterThan(0);
    }
  });
});
