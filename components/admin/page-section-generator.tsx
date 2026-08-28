"use client";

import { useState } from "react";

const ICONS = ["globe", "briefcase", "activity", "people", "wallet", "settings", "user", "grid", "sparkles", "shield", "chart", "arrow"] as const;

interface PageEntry {
  id: string;
  title: string;
  route: string;
  icon: string;
  category: "module" | "section" | "report";
  active: boolean;
}

const INITIAL_PAGES: PageEntry[] = [
  { id: "dashboard", title: "Command Dashboard", route: "/dashboard", icon: "globe", category: "module", active: true },
  { id: "projects", title: "Projects Center", route: "/projects", icon: "briefcase", category: "module", active: true },
  { id: "academy", title: "Jenan Academy", route: "/academy", icon: "sparkles", category: "module", active: true },
  { id: "market", title: "Global Market", route: "/market", icon: "activity", category: "module", active: true },
  { id: "studio", title: "Jenan AI Studio", route: "/studio", icon: "sparkles", category: "module", active: true },
  { id: "talent", title: "Talent Network", route: "/talent", icon: "people", category: "module", active: true },
  { id: "software", title: "Software Solutions", route: "/software", icon: "grid", category: "module", active: true },
  { id: "marketing", title: "Marketing Center", route: "/marketing", icon: "chart", category: "module", active: true },
];

const TEXTS = {
  ar: {
    title: "مولّد الصفحات والأقسام",
    subtitle: "أنشئ صفحات جديدة أو أقسامًا من هنا وستطبّق تلقائيًا نفس نظام التصميم",
    addBtn: "إضافة صفحة / قسم",
    cancelBtn: "إلغاء",
    saveBtn: "حفظ",
    pageTitle: "عنوان الصفحة",
    pageRoute: "المسار",
    pageIcon: "الأيقونة",
    pageCategory: "النوع",
    module: "وحدة رئيسية",
    section: "قسم",
    report: "تقرير",
    activeLabel: "نشط",
    totalLabel: "إجمالي الصفحات",
    activeCountLabel: "نشطة",
    designNote: "جميع الصفحات المُولَّدة ترث نظام التصميم الموحّد تلقائيًا",
    routeHint: "يجب أن يبدأ بـ /",
    noTitle: "عنوان مطلوب",
    noRoute: "مسار مطلوب",
    badRoute: "يجب أن يبدأ المسار بـ /",
    duplicateRoute: "المسار مستخدم بالفعل",
    search: "بحث عن صفحة...",
    filterAll: "الكل",
    filterModule: "وحدات",
    filterSection: "أقسام",
    filterReport: "تقارير",
    confirmDelete: "حذف هذه الصفحة؟",
    emptySearch: "لا توجد صفحات تطابق البحث",
  },
  en: {
    title: "Page & Section Generator",
    subtitle: "Create new pages or sections here — they inherit the unified design system automatically",
    addBtn: "Add page / section",
    cancelBtn: "Cancel",
    saveBtn: "Save",
    pageTitle: "Page title",
    pageRoute: "Route",
    pageIcon: "Icon",
    pageCategory: "Type",
    module: "Main module",
    section: "Section",
    report: "Report",
    activeLabel: "Active",
    totalLabel: "Total pages",
    activeCountLabel: "active",
    designNote: "All generated pages automatically inherit the unified design system",
    routeHint: "Must start with /",
    noTitle: "Title required",
    noRoute: "Route required",
    badRoute: "Route must start with /",
    duplicateRoute: "Route already exists",
    search: "Search pages...",
    filterAll: "All",
    filterModule: "Modules",
    filterSection: "Sections",
    filterReport: "Reports",
    confirmDelete: "Delete this page?",
    emptySearch: "No pages match the search",
  },
} as const;

type Lang = "ar" | "en";
type CategoryFilter = "all" | "module" | "section" | "report";

export function PageSectionGenerator({ lang = "ar" }: { lang?: Lang }) {
  const t = TEXTS[lang];
  const [pages, setPages] = useState<PageEntry[]>(INITIAL_PAGES);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<CategoryFilter>("all");
  const [formData, setFormData] = useState({ title: "", route: "/", icon: "globe", category: "module" as PageEntry["category"] });
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!formData.title.trim()) e.title = t.noTitle;
    if (!formData.route.trim()) e.route = t.noRoute;
    else if (!formData.route.startsWith("/")) e.route = t.badRoute;
    else if (pages.some((p) => p.route === formData.route.trim())) e.route = t.duplicateRoute;
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSave() {
    if (!validate()) return;
    const entry: PageEntry = {
      id: formData.route.replace(/\//g, "-").slice(1) || Date.now().toString(),
      title: formData.title.trim(),
      route: formData.route.trim(),
      icon: formData.icon,
      category: formData.category,
      active: true,
    };
    setPages((prev) => [...prev, entry]);
    setShowForm(false);
    setFormData({ title: "", route: "/", icon: "globe", category: "module" });
    setErrors({});
  }

  function toggleActive(id: string) {
    setPages((prev) => prev.map((p) => (p.id === id ? { ...p, active: !p.active } : p)));
  }

  function removePage(id: string) {
    setPages((prev) => prev.filter((p) => p.id !== id));
  }

  const filtered = pages.filter((p) => {
    const matchSearch = !search || p.title.toLowerCase().includes(search.toLowerCase()) || p.route.includes(search);
    const matchFilter = filter === "all" || p.category === filter;
    return matchSearch && matchFilter;
  });

  const activeCount = pages.filter((p) => p.active).length;

  return (
    <div className="psg-container" dir={lang === "ar" ? "rtl" : "ltr"}>
      <div className="psg-header">
        <div className="psg-title-group">
          <h2 className="psg-title">{t.title}</h2>
          <p className="psg-subtitle">{t.subtitle}</p>
        </div>
        <div className="psg-stats">
          <div className="psg-stat">
            <strong>{pages.length}</strong>
            <span>{t.totalLabel}</span>
          </div>
          <div className="psg-stat psg-stat--active">
            <strong>{activeCount}</strong>
            <span>{t.activeCountLabel}</span>
          </div>
        </div>
      </div>

      <div className="psg-toolbar">
        <input
          className="psg-search"
          type="search"
          placeholder={t.search}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="psg-filters">
          {(["all", "module", "section", "report"] as const).map((f) => (
            <button
              key={f}
              className={`psg-filter-btn${filter === f ? " psg-filter-btn--active" : ""}`}
              onClick={() => setFilter(f)}
              type="button"
            >
              {t[f === "all" ? "filterAll" : f === "module" ? "filterModule" : f === "section" ? "filterSection" : "filterReport"]}
            </button>
          ))}
        </div>
        <button className="psg-add-btn" type="button" onClick={() => { setShowForm(true); setErrors({}); }}>
          + {t.addBtn}
        </button>
      </div>

      {showForm && (
        <div className="psg-form glass">
          <div className="psg-form-grid">
            <div className="psg-field">
              <label>{t.pageTitle}</label>
              <input
                className={errors.title ? "psg-input psg-input--error" : "psg-input"}
                value={formData.title}
                onChange={(e) => setFormData((d) => ({ ...d, title: e.target.value }))}
                placeholder="e.g. Analytics Center"
              />
              {errors.title && <span className="psg-error">{errors.title}</span>}
            </div>
            <div className="psg-field">
              <label>{t.pageRoute}</label>
              <input
                className={errors.route ? "psg-input psg-input--error" : "psg-input"}
                value={formData.route}
                onChange={(e) => setFormData((d) => ({ ...d, route: e.target.value }))}
                placeholder="/analytics"
              />
              {errors.route ? <span className="psg-error">{errors.route}</span> : <span className="psg-hint">{t.routeHint}</span>}
            </div>
            <div className="psg-field">
              <label>{t.pageCategory}</label>
              <select
                className="psg-input"
                value={formData.category}
                onChange={(e) => setFormData((d) => ({ ...d, category: e.target.value as PageEntry["category"] }))}
              >
                <option value="module">{t.module}</option>
                <option value="section">{t.section}</option>
                <option value="report">{t.report}</option>
              </select>
            </div>
            <div className="psg-field">
              <label>{t.pageIcon}</label>
              <div className="psg-icon-grid">
                {ICONS.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    className={`psg-icon-btn${formData.icon === ic ? " psg-icon-btn--active" : ""}`}
                    onClick={() => setFormData((d) => ({ ...d, icon: ic }))}
                    title={ic}
                  >
                    <span className="psg-icon-label">{ic.slice(0, 3)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="psg-form-actions">
            <button className="psg-save-btn" type="button" onClick={handleSave}>{t.saveBtn}</button>
            <button className="psg-cancel-btn" type="button" onClick={() => { setShowForm(false); setErrors({}); }}>{t.cancelBtn}</button>
          </div>
        </div>
      )}

      <div className="psg-design-note">
        <span className="psg-design-dot" />
        {t.designNote}
      </div>

      {filtered.length === 0 ? (
        <div className="psg-empty">{t.emptySearch}</div>
      ) : (
        <div className="psg-grid">
          {filtered.map((page) => (
            <div key={page.id} className={`psg-card glass${page.active ? "" : " psg-card--inactive"}`}>
              <div className="psg-card-header">
                <span className="psg-card-icon">{page.icon.slice(0, 2).toUpperCase()}</span>
                <div className="psg-card-meta">
                  <strong>{page.title}</strong>
                  <code>{page.route}</code>
                </div>
                <span className={`psg-badge psg-badge--${page.category}`}>{page.category}</span>
              </div>
              <div className="psg-card-actions">
                <button
                  className={`psg-toggle${page.active ? " psg-toggle--on" : ""}`}
                  type="button"
                  onClick={() => toggleActive(page.id)}
                  title={t.activeLabel}
                >
                  <span className="psg-toggle-knob" />
                  {page.active ? t.activeLabel : "—"}
                </button>
                <button
                  className="psg-remove-btn"
                  type="button"
                  onClick={() => { if (window.confirm(t.confirmDelete)) removePage(page.id); }}
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
