// بيانات وصفية مركزية للكيانات — تقود عمليات CRUD والتحقّق والاستيراد/التصدير ورفض التكرار.

export type FieldType = "text" | "date" | "int" | "companyRef";

export interface FieldDef {
  col: string;        // اسم العمود في قاعدة البيانات
  header: string;     // ترويسة Excel / العنوان العربي
  type: FieldType;
  required?: boolean;
}

export interface EntityDef {
  table: string;
  labelAr: string;
  fields: FieldDef[];
  // مفاتيح الفرادة للرفض عند الاستيراد (أي تطابق في أحدها = تكرار)
  uniqueKeys: string[];
  // فرادة مركّبة احتياطية (تُستخدم عند غياب قيمة في uniqueKeys)، مثل التراخيص
  compositeKey?: string[];
}

export const ENTITIES: Record<string, EntityDef> = {
  companies: {
    table: "companies",
    labelAr: "الشركات",
    uniqueKeys: ["cr_number", "mol_number"],
    fields: [
      { col: "name", header: "اسم الشركة", type: "text", required: true },
      { col: "cr_number", header: "رقم السجل التجاري", type: "text" },
      { col: "mol_number", header: "رقم المنشأة (الموارد البشرية)", type: "text" },
      { col: "notes", header: "ملاحظات", type: "text" },
    ],
  },
  employees: {
    table: "employees",
    labelAr: "الموظفون",
    uniqueKeys: ["iqama_number"],
    fields: [
      { col: "name", header: "اسم الموظف", type: "text", required: true },
      { col: "iqama_number", header: "رقم الإقامة", type: "text", required: true },
      { col: "company_id", header: "الشركة", type: "companyRef" },
      { col: "iqama_expiry", header: "تاريخ انتهاء الإقامة", type: "date" },
      { col: "notes", header: "ملاحظات", type: "text" },
    ],
  },
  licenses: {
    table: "licenses",
    labelAr: "التراخيص والسجلات",
    uniqueKeys: ["license_number"],
    compositeKey: ["company_id", "title"],
    fields: [
      { col: "title", header: "البيان", type: "text", required: true },
      { col: "company_id", header: "الشركة", type: "companyRef" },
      { col: "license_number", header: "رقم الترخيص", type: "text" },
      { col: "issuer", header: "الجهة / المنصة", type: "text" },
      { col: "expiry", header: "تاريخ الانتهاء (ميلادي)", type: "date" },
      { col: "hijri_expiry", header: "تاريخ الانتهاء (هجري)", type: "text" },
      { col: "recurring_note", header: "بند متكرر", type: "text" },
      { col: "notes", header: "ملاحظات", type: "text" },
    ],
  },
  vehicles: {
    table: "vehicles",
    labelAr: "المركبات",
    uniqueKeys: ["plate_number"],
    fields: [
      { col: "type", header: "نوع المركبة", type: "text", required: true },
      { col: "plate_number", header: "رقم اللوحة", type: "text", required: true },
      { col: "company_id", header: "الشركة", type: "companyRef" },
      { col: "form_expiry", header: "انتهاء الاستمارة (ميلادي)", type: "date" },
      { col: "form_expiry_hijri", header: "انتهاء الاستمارة (هجري)", type: "text" },
      { col: "inspection_expiry", header: "انتهاء الفحص (ميلادي)", type: "date" },
      { col: "inspection_expiry_hijri", header: "انتهاء الفحص (هجري)", type: "text" },
      { col: "condition", header: "حالة المركبة", type: "text" },
      { col: "notes", header: "ملاحظات", type: "text" },
    ],
  },
  platforms: {
    table: "platforms",
    labelAr: "المنصات والأنظمة",
    uniqueKeys: ["name"],
    fields: [
      { col: "name", header: "اسم الجهة / النظام", type: "text", required: true },
      { col: "entity", header: "الجهة المرتبطة", type: "text" },
      { col: "notes", header: "ملاحظات", type: "text" },
    ],
  },
};

export function isEntity(name: string): name is keyof typeof ENTITIES {
  return Object.prototype.hasOwnProperty.call(ENTITIES, name);
}
