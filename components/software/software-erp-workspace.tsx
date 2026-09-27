"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";

import { SoftwareModuleView } from "@/components/software/software-module-view";
import type { SoftwareApiPayload, SoftwareOrganization, SoftwareWorkspaceData } from "@/components/software/software-erp-types";
import { Icon, type IconName } from "@/components/ui/icons";
import { SOFTWARE_FLOW_ROUTES, type SoftwareFlowRoute, type SoftwareRouteId } from "@/lib/software/software-routes";
import type { Locale } from "@/types/i18n";

const primaryRoutes = ["dashboard", "sales", "accounting", "hr", "inventory", "crm", "projects", "pos", "purchases", "company", "reports"] as const;
const moduleCards: { href: string; icon: IconName; title: string; copy: [string, string] }[] = [
  { href: "/software/sales", icon: "trend", title: "Sales", copy: ["العملاء ودورة البيع والتحصيل", "Customers, sales, and collections"] },
  { href: "/software/accounting", icon: "wallet", title: "Accounting", copy: ["قيود فعلية وربحية تشغيلية", "Live entries and operating profit"] },
  { href: "/software/hr", icon: "people", title: "HR", copy: ["الموظفون والحضور والرواتب", "Employees, attendance, and payroll"] },
  { href: "/software/inventory", icon: "grid", title: "Inventory", copy: ["الأصناف والحركات وإعادة الطلب", "Products, movements, and reorder levels"] },
  { href: "/software/crm", icon: "user", title: "CRM", copy: ["العملاء المحتملون وخط المبيعات", "Leads and sales pipeline"] },
  { href: "/software/projects", icon: "briefcase", title: "Projects", copy: ["المشاريع التشغيلية المرتبطة", "Connected operational projects"] },
  { href: "/software/pos", icon: "cart", title: "POS", copy: ["ورديات ومبيعات ومطابقة النقد", "Shifts, sales, and cash reconciliation"] },
  { href: "/software/purchases", icon: "building", title: "Purchases", copy: ["الموردون وأوامر الشراء والاستلام", "Suppliers, orders, and receiving"] },
  { href: "/software/company", icon: "settings", title: "Company", copy: ["الأعضاء والبرامج والصلاحيات", "Members, programs, and roles"] },
  { href: "/software/reports", icon: "barChart", title: "Reports", copy: ["تقرير موحد من السجلات الحقيقية", "Unified report from live records"] },
];

const routeDescriptions: Record<SoftwareRouteId, [string, string]> = {
  dashboard: ["نظام تشغيل أعمال موحّد مبني على سجلات المنظمة الفعلية.", "A unified business operating system backed by your organization's records."],
  sales: ["لوحة دورة المبيعات من العميل حتى التحصيل.", "The sales cycle from customer to collection."],
  "sales-customers": ["سجل العملاء وبيانات التواصل والضرائب.", "Customer records, contact details, and tax identifiers."],
  "sales-quotes": ["عروض أسعار ببنود وضريبة محسوبة على الخادم.", "Quotes with server-calculated lines and tax."],
  "sales-orders": ["أوامر بيع قابلة للتنفيذ وربط المخزون.", "Sales orders with fulfillment and inventory linkage."],
  "sales-invoices": ["فواتير بيع ومتابعة الرصيد والتحصيل.", "Sales invoices with balance and collection tracking."],
  "sales-receipts": ["سندات قبض مرتبطة بالفواتير والقيود المالية.", "Receipts linked to invoices and financial entries."],
  "sales-products": ["كتالوج المنتجات والأسعار والتكلفة والمخزون.", "Product catalog, pricing, cost, and stock."],
  "sales-returns": ["مرتجعات موثقة تعيد الكميات عند التنفيذ.", "Documented returns that restore stock on fulfillment."],
  "sales-reports": ["مؤشرات الإيراد والتحصيل والعملاء والمنتجات.", "Revenue, collection, customer, and product metrics."],
  accounting: ["دفتر مالي مشتق من التحصيل والمشتريات والرواتب.", "A ledger derived from collections, purchasing, and payroll."],
  hr: ["لوحة الموارد البشرية والرواتب والحضور.", "People, payroll, and attendance operations."],
  "hr-employees": ["ملفات الموظفين والأدوار والرواتب الأساسية.", "Employee records, roles, and base salaries."],
  "hr-attendance": ["سجل حضور يومي قابل للتحديث والتدقيق.", "An auditable daily attendance register."],
  "hr-leave": ["طلبات الإجازة والموافقة عليها.", "Leave requests and approval workflow."],
  "hr-payroll": ["مسيرات رواتب حتمية وترحيل مالي واضح.", "Deterministic payroll runs with explicit posting."],
  "hr-performance": ["تقييمات أداء مؤرخة ومرتبطة بالموظف.", "Dated performance reviews linked to employees."],
  inventory: ["الكميات والحركات وحد إعادة الطلب.", "Stock levels, movements, and reorder thresholds."],
  crm: ["خط العملاء المحتملين والقيمة والخطوة التالية.", "Lead pipeline, value, and next action."],
  projects: ["عرض مباشر لمشاريع المنظمة في محرك المشاريع.", "A live view of organization projects from the Projects engine."],
  pos: ["وردية بيع، مخزون، تحصيل، وتسوية نقدية.", "Sales shifts, stock, collection, and cash reconciliation."],
  purchases: ["الموردون والطلبات والاستلام والقيد المالي.", "Suppliers, orders, receiving, and financial posting."],
  company: ["هوية المنظمة والأعضاء والبرامج المفعلة.", "Organization identity, members, and active programs."],
  reports: ["صورة موحدة قابلة للطباعة من البيانات الحالية.", "A printable unified view of current records."],
};

function pick(copy: readonly [string, string], locale: Locale) {
  return locale === "ar" ? copy[0] : copy[1];
}

export type SoftwareCommandRunner = (command: Record<string, unknown>, successMessage: [string, string]) => Promise<boolean>;

export function SoftwareErpWorkspace({ locale, route }: { locale: Locale; route: SoftwareFlowRoute }) {
  const ar = locale === "ar";
  const [organizations, setOrganizations] = useState<SoftwareOrganization[]>([]);
  const [workspace, setWorkspace] = useState<SoftwareWorkspaceData | null>(null);
  const [selectedOrganizationId, setSelectedOrganizationId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      const query = selectedOrganizationId ? `?organizationId=${encodeURIComponent(selectedOrganizationId)}` : "";
      const response = await fetch(`/api/software/operations${query}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as SoftwareApiPayload | null;
      if (!active) return;
      if (response.ok && payload) {
        setOrganizations(payload.organizations);
        setWorkspace(payload.workspace);
        if (!selectedOrganizationId && payload.workspace) setSelectedOrganizationId(payload.workspace.company.id);
      } else {
        setMessage(payload?.message ?? (ar ? "تعذر تحميل Jenan Software." : "Jenan Software could not be loaded."));
      }
      setLoading(false);
    }
    void load();
    return () => { active = false; };
  }, [ar, refreshVersion, selectedOrganizationId]);

  const runCommand: SoftwareCommandRunner = async (command, successMessage) => {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/software/operations", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(command) });
    const payload = await response.json().catch(() => null) as { message?: string; result?: { id?: string } } | null;
    if (response.ok) {
      if (command.action === "createOrganization" && payload?.result?.id) setSelectedOrganizationId(payload.result.id);
      setMessage(pick(successMessage, locale));
      setRefreshVersion((value) => value + 1);
      setBusy(false);
      return true;
    }
    setMessage(payload?.message ?? (ar ? "تعذر تنفيذ العملية." : "The operation could not be completed."));
    setBusy(false);
    return false;
  };

  async function createOrganization(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (await runCommand({ action: "createOrganization", name: String(data.get("name") ?? "") }, ["تم إنشاء المنظمة.", "Organization created."])) form.reset();
  }

  const primaryDefinitions = primaryRoutes.map((id) => SOFTWARE_FLOW_ROUTES.find((definition) => definition.id === id)!);
  const sectionRoutes = route.section === "sales" ? SOFTWARE_FLOW_ROUTES.filter((definition) => definition.section === "sales") : route.section === "hr" ? SOFTWARE_FLOW_ROUTES.filter((definition) => definition.section === "hr") : [];

  return (
    <section className="software-erp" data-software-module={route.id} data-software-output={route.id.includes("reports") ? "PRINT_PDF" : "OPERATIONAL_RECORDS"} data-software-route={route.route} data-software-section={route.section} data-software-source="ORGANIZATION_RECORDS">
      <nav className="software-erp__nav" aria-label={ar ? "وحدات Jenan Software" : "Jenan Software modules"}>{primaryDefinitions.map((definition) => {
        const active = definition.id === route.id || route.section === "sales" && definition.id === "sales" || route.section === "hr" && definition.id === "hr";
        return <Link aria-current={definition.id === route.id ? "page" : undefined} className={active ? "is-active" : ""} href={definition.route} key={definition.id}>{pick(definition.title, locale)}</Link>;
      })}</nav>
      {sectionRoutes.length ? <nav className="software-erp__subnav" aria-label={ar ? "مسارات الوحدة" : "Module routes"}>{sectionRoutes.map((definition, index) => <Link aria-current={definition.id === route.id ? "page" : undefined} className={definition.id === route.id ? "is-active" : ""} href={definition.route} key={definition.id}><span>{String(index + 1).padStart(2, "0")}</span>{pick(definition.title, locale)}</Link>)}</nav> : null}

      <header className="software-erp__hero">
        <div><span>JENAN SOFTWARE · {route.id.toUpperCase().replaceAll("-", " ")}</span><h1>{pick(route.title, locale)}</h1><p>{pick(routeDescriptions[route.id], locale)}</p></div>
        <div className="software-erp__org">
          <label>{ar ? "المنظمة" : "Organization"}<select aria-label={ar ? "المنظمة" : "Organization"} onChange={(event) => setSelectedOrganizationId(event.target.value)} value={selectedOrganizationId}>{organizations.map((membership) => <option key={membership.organization.id} value={membership.organization.id}>{membership.organization.name}{membership.isOwner ? (ar ? " · مالك" : " · Owner") : ""}</option>)}</select></label>
          {workspace ? <small><Icon name="shield" />{workspace.company.currentUserIsOwner ? (ar ? "صلاحية مالك" : "Owner access") : (ar ? "عضو نشط" : "Active member")}</small> : null}
        </div>
      </header>

      {loading ? <div className="software-erp__loading"><span />{ar ? "جارٍ تحميل العمليات..." : "Loading operations..."}</div> : null}
      {!loading && !workspace ? <section className="software-erp__onboarding"><Icon name="building" /><h2>{ar ? "ابدأ بإنشاء منظمة" : "Create an organization to begin"}</h2><p>{ar ? "كل سجل في Jenan Software معزول داخل منظمة وعضوية فعالة." : "Every Jenan Software record is isolated within an organization and active membership."}</p><form onSubmit={createOrganization}><input name="name" placeholder={ar ? "اسم المنظمة" : "Organization name"} required minLength={2} /><button className="button button--primary" disabled={busy} type="submit"><Icon name="plus" />{ar ? "إنشاء المنظمة" : "Create organization"}</button></form></section> : null}

      {!loading && workspace && route.id === "dashboard" ? <>
        <section className="software-erp__signals"><article><span>01</span><strong>{workspace.salesSummary.invoiceTotalMinor / 100}</strong><small>{ar ? "إجمالي الفواتير" : "Invoice total"} · {workspace.sales.documents[0]?.currency ?? "SAR"}</small></article><article><span>02</span><strong>{workspace.operationsSummary.profitMinor / 100}</strong><small>{ar ? "صافي الحركة" : "Operating net"} · SAR</small></article><article><span>03</span><strong>{workspace.hr.employees.length}</strong><small>{ar ? "موظفون" : "Employees"}</small></article><article><span>04</span><strong>{workspace.operationsSummary.lowStock}</strong><small>{ar ? "أصناف منخفضة" : "Low-stock items"}</small></article></section>
        <section className="software-erp__modules">{moduleCards.map((card) => <Link href={card.href} key={card.href}><span><Icon name={card.icon} /></span><div><h2>{card.title}</h2><p>{pick(card.copy, locale)}</p></div><Icon name="arrow" /></Link>)}</section>
      </> : null}

      {!loading && workspace && route.id !== "dashboard" ? <SoftwareModuleView busy={busy} locale={locale} message={message} routeId={route.id} runCommand={runCommand} workspace={workspace} /> : null}
      {!loading && workspace && route.id === "dashboard" && message ? <p className="software-erp__message" role="status">{message}</p> : null}
    </section>
  );
}