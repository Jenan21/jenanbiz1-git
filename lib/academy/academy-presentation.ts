import type { IconName } from "@/components/ui/icons";

export type AcademyCategory = {
  color: "blue" | "cyan" | "emerald" | "gold" | "orange" | "purple";
  description: readonly [string, string];
  icon: IconName;
  id: string;
  keys: readonly string[];
  label: readonly [string, string];
};

export const academyCategories: readonly AcademyCategory[] = [
  { id: "business", label: ["المال والأعمال", "Finance and business"], description: ["الإدارة والتمويل وريادة الأعمال", "Management, finance, and entrepreneurship"], icon: "barChart", color: "gold", keys: ["finance", "accounting", "management", "entrepreneurship"] },
  { id: "investment", label: ["الاستثمار", "Investment"], description: ["الأسواق والتحليل وإدارة المحافظ", "Markets, analysis, and portfolio management"], icon: "trend", color: "emerald", keys: ["investment", "finance", "market"] },
  { id: "commerce", label: ["التجارة الإلكترونية", "E-commerce"], description: ["المتاجر الرقمية والمبيعات والنمو", "Digital stores, sales, and growth"], icon: "cart", color: "purple", keys: ["ecommerce", "sales"] },
  { id: "companies", label: ["تأسيس الشركات", "Company formation"], description: ["بناء الشركات والحوكمة والتشغيل", "Company building, governance, and operations"], icon: "building", color: "blue", keys: ["entrepreneurship", "architecture", "governance"] },
  { id: "technology", label: ["التقنية والبرمجة", "Technology"], description: ["الذكاء الاصطناعي والبيانات والبرمجة", "AI, data, and software engineering"], icon: "brain", color: "cyan", keys: ["ai-engineering", "database", "software", "technology"] },
  { id: "workforce", label: ["الموارد البشرية", "Human resources"], description: ["التوظيف والقيادة وتطوير الفرق", "Hiring, leadership, and team development"], icon: "people", color: "orange", keys: ["human-resources", "supervision", "leadership"] },
  { id: "projects", label: ["إدارة المشاريع", "Project management"], description: ["التخطيط والتنفيذ وقياس الأداء", "Planning, delivery, and performance"], icon: "briefcase", color: "cyan", keys: ["product-project-management", "project"] },
  { id: "marketing", label: ["التسويق والإعلان", "Marketing"], description: ["العلامة التجارية والمحتوى والحملات", "Brand, content, and campaigns"], icon: "megaphone", color: "purple", keys: ["marketing", "advertising"] },
  { id: "accounting", label: ["المحاسبة والمالية", "Accounting"], description: ["التقارير والميزانيات والرقابة", "Reporting, budgets, and control"], icon: "pieChart", color: "gold", keys: ["accounting", "cost-optimization"] },
  { id: "legal", label: ["العقود والأنظمة", "Contracts and regulation"], description: ["الامتثال والعقود والحوكمة", "Compliance, contracts, and governance"], icon: "shield", color: "blue", keys: ["legal", "compliance", "governance"] },
  { id: "operations", label: ["التشغيل والصيانة", "Operations"], description: ["رفع الكفاءة والجودة والاستدامة", "Efficiency, quality, and sustainability"], icon: "settings", color: "orange", keys: ["operations", "maintenance", "quality"] },
  { id: "innovation", label: ["الأبحاث والابتكار", "Research and innovation"], description: ["البحث والتطوير وبناء الحلول", "Research, development, and solution design"], icon: "sparkles", color: "emerald", keys: ["innovation-rnd", "research", "design"] },
] as const;

export function courseMatchesCategory(fieldKey: string | null | undefined, category: AcademyCategory) {
  const normalized = fieldKey?.toLocaleLowerCase() ?? "";
  return category.keys.some((key) => normalized.includes(key));
}

export function localized(value: readonly [string, string], arabic: boolean) {
  return arabic ? value[0] : value[1];
}
