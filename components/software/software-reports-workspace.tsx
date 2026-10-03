"use client";

import { useState } from "react";

import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";
import { Icon } from "@/components/ui/icons";
import { accountingCurrencies, buildAccountingStatements } from "@/lib/software/accounting-statements";
import { buildCrmAnalytics, buildInventoryAnalytics, buildProjectOperations } from "@/lib/software/operational-analytics";
import { serializeSoftwareCsv, type SoftwareRouteExport } from "@/lib/software/route-export";
import type { Locale } from "@/types/i18n";

type ReportId = "sales" | "finance" | "hr" | "inventory" | "crm" | "projects";
type ReportData = { caveat: string; headers: string[]; metrics: Array<{ label: string; value: string }>; rows: Array<Array<number | string | null | undefined>>; source: string; title: string };

const reportLabels: Record<ReportId, [string, string]> = {
  sales: ["المبيعات", "Sales"], finance: ["المالية", "Finance"], hr: ["الموارد البشرية", "HR"], inventory: ["المخزون", "Inventory"], crm: ["CRM", "CRM"], projects: ["المشاريع", "Projects"],
};

function money(amountMinor: number, currency: string, locale: Locale) {
  return new Intl.NumberFormat(locale === "ar" ? "ar-SA" : "en-US", { currency, style: "currency" }).format(amountMinor / 100);
}

function moneyGroups(items: Array<{ amountMinor: number; currency: string }>, locale: Locale) {
  const totals = new Map<string, number>();
  items.forEach((item) => totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.amountMinor));
  return [...totals.entries()].map(([currency, amount]) => money(amount, currency, locale)).join(" · ") || "—";
}

function reportData(id: ReportId, workspace: SoftwareWorkspaceData, locale: Locale): ReportData {
  const ar = locale === "ar";
  if (id === "sales") {
    const documents = workspace.sales.documents;
    const invoices = documents.filter((document) => document.kind === "INVOICE" && document.status !== "VOID");
    return { title: ar ? "تقرير المبيعات" : "Sales report", source: ar ? "المصدر: مستندات المبيعات وسندات القبض" : "Source: sales documents and receipts", caveat: ar ? "القيم مفصولة حسب عملة كل سجل ولا تمثل تسوية بنكية." : "Values retain each record's currency and do not represent bank reconciliation.", headers: [ar ? "الرقم" : "Number", ar ? "النوع" : "Kind", ar ? "العميل" : "Customer", ar ? "الإجمالي" : "Total minor", ar ? "العملة" : "Currency", ar ? "الحالة" : "Status"], rows: documents.map((document) => [document.number, document.kind, document.customer?.name, document.totalMinor, document.currency, document.status]), metrics: [{ label: ar ? "المستندات" : "Documents", value: String(documents.length) }, { label: ar ? "الفواتير" : "Invoices", value: String(invoices.length) }, { label: ar ? "إجمالي الفواتير" : "Invoice value", value: moneyGroups(invoices.map((invoice) => ({ amountMinor: invoice.totalMinor, currency: invoice.currency })), locale) }, { label: ar ? "المقبوضات" : "Collections", value: moneyGroups(workspace.sales.receipts, locale) }] };
  }
  if (id === "finance") {
    const statements = accountingCurrencies(workspace).map((currency) => buildAccountingStatements(workspace, currency));
    return { title: ar ? "التقرير المالي التشغيلي" : "Operating finance report", source: ar ? "المصدر: القيود المالية والفواتير والمخزون" : "Source: financial entries, invoices, and inventory", caveat: ar ? "Cash-basis تشغيلي؛ الدائنون ورأس المال والتسوية البنكية غير مكتملة." : "Operational cash-basis view; payables, equity, and bank reconciliation remain incomplete.", headers: [ar ? "العملة" : "Currency", ar ? "الدخل" : "Income minor", ar ? "المصروف" : "Expense minor", ar ? "الصافي" : "Net minor", ar ? "الذمم" : "Receivables minor", ar ? "المخزون" : "Inventory minor"], rows: statements.map((statement) => [statement.currency, statement.incomeStatement.incomeMinor, statement.incomeStatement.expenseMinor, statement.incomeStatement.netMinor, statement.balanceSnapshot.receivablesMinor, statement.balanceSnapshot.inventoryMinor]), metrics: [{ label: ar ? "العملات" : "Currencies", value: String(statements.length) }, { label: ar ? "القيود" : "Entries", value: String(workspace.operations.entries.length) }, { label: ar ? "حالة الميزانية" : "Balance status", value: ar ? "جزئية" : "Partial" }, { label: ar ? "الإقرار الضريبي" : "Tax filing", value: "NOT_CONNECTED" }] };
  }
  if (id === "hr") {
    const payrolls = workspace.hr.payrollRuns;
    return { title: ar ? "تقرير الموارد البشرية" : "HR report", source: ar ? "المصدر: الموظفون والحضور والإجازات ومسيرات الرواتب" : "Source: employees, attendance, leave, and payroll records", caveat: ar ? "الرواتب بيانات حساسة؛ التقرير متاح وفق صلاحية المنظمة الحالية." : "Payroll is sensitive data and follows current organization access.", headers: [ar ? "الموظف" : "Employee", ar ? "الرقم" : "Number", ar ? "المسمى" : "Role", ar ? "الراتب" : "Salary minor", ar ? "العملة" : "Currency", ar ? "الحالة" : "Status"], rows: workspace.hr.employees.map((employee) => [employee.name, employee.employeeNumber, employee.roleTitle, employee.salaryMinor, employee.currency, employee.status]), metrics: [{ label: ar ? "الموظفون" : "Employees", value: String(workspace.hr.employees.length) }, { label: ar ? "سجلات الحضور" : "Attendance records", value: String(workspace.hr.attendance.length) }, { label: ar ? "إجازات معلقة" : "Pending leave", value: String(workspace.hr.leaveRequests.filter((request) => request.status === "PENDING").length) }, { label: ar ? "رواتب مرحلة" : "Posted payroll", value: moneyGroups(payrolls.filter((run) => run.status === "POSTED").map((run) => ({ amountMinor: run.totalNetMinor, currency: "SAR" })), locale) }] };
  }
  if (id === "inventory") {
    const inventory = buildInventoryAnalytics(workspace);
    return { title: ar ? "تقرير المخزون" : "Inventory report", source: ar ? "المصدر: الأصناف والكميات والحركات" : "Source: products, quantities, and movements", caveat: ar ? "قيمة المخزون محسوبة بالتكلفة المسجلة، ولا تشمل انخفاض القيمة أو تكاليف الشحن." : "Inventory value uses recorded cost and excludes impairment and freight.", headers: ["SKU", ar ? "الصنف" : "Item", ar ? "الكمية" : "Quantity", ar ? "حد الطلب" : "Reorder level", ar ? "تكلفة الوحدة" : "Unit cost minor", ar ? "العملة" : "Currency"], rows: workspace.sales.products.map((product) => [product.sku, product.name, product.stockQuantity, product.reorderLevel, product.costMinor, product.currency]), metrics: [{ label: ar ? "الأصناف" : "Items", value: String(inventory.itemCount) }, { label: ar ? "الوحدات" : "Units", value: String(inventory.unitCount) }, { label: ar ? "مخزون منخفض" : "Low stock", value: String(inventory.lowStockCount) }, { label: ar ? "القيمة بالتكلفة" : "Value at cost", value: inventory.values.map((item) => money(item.costMinor, item.currency, locale)).join(" · ") || "—" }] };
  }
  if (id === "crm") {
    const crm = buildCrmAnalytics(workspace);
    return { title: ar ? "تقرير CRM" : "CRM report", source: ar ? "المصدر: الفرص وسجل التدقيق" : "Source: leads and audit history", caveat: ar ? "التوقع الموزون تقدير تخطيطي مبني على أوزان مراحل معلنة، وليس إيرادًا مضمونًا." : "Weighted forecast is a planning estimate based on disclosed stage weights, not guaranteed revenue.", headers: [ar ? "الفرصة" : "Opportunity", ar ? "المصدر" : "Source", ar ? "القيمة" : "Value minor", ar ? "العملة" : "Currency", ar ? "المرحلة" : "Stage", ar ? "التالي" : "Next action"], rows: workspace.operations.leads.map((lead) => [lead.name, lead.source, lead.valueMinor, lead.currency, lead.status, lead.nextAction]), metrics: [{ label: ar ? "الفرص" : "Leads", value: String(workspace.operations.leads.length) }, { label: ar ? "أنشطة مدققة" : "Audited activities", value: String(workspace.operations.crmActivities.length) }, { label: ar ? "خط مفتوح" : "Open pipeline", value: crm.currencies.map((item) => money(item.openMinor, item.currency, locale)).join(" · ") || "—" }, { label: ar ? "توقع موزون" : "Weighted estimate", value: crm.currencies.map((item) => money(item.weightedMinor, item.currency, locale)).join(" · ") || "—" }] };
  }
  const projects = buildProjectOperations(workspace);
  return { title: ar ? "تقرير المشاريع التشغيلية" : "Operational projects report", source: ar ? "المصدر: محرك مشاريع Jenan PRO" : "Source: Jenan PRO Projects engine", caveat: ar ? "المراحل هي وحدات العمل الحالية؛ لا يوجد سجل مهام أو وقت مستقل." : "Phases are the current work units; separate task and time ledgers are unavailable.", headers: [ar ? "المشروع" : "Project", ar ? "الحالة" : "Status", ar ? "المرحلة" : "Phase", ar ? "الإنجاز %" : "Completion %", ar ? "الفريق" : "Team", ar ? "الميزانية" : "Budget"], rows: projects.projects.map((project) => [project.name, project.status, project.currentPhase, project.completionPercent, project.members.length, project.initialInvestment]), metrics: [{ label: ar ? "نشطة" : "Active", value: String(projects.activeProjects) }, { label: ar ? "مراحل مكتملة" : "Completed phases", value: String(projects.completedPhases) }, { label: ar ? "عضويات" : "Memberships", value: String(projects.teamSeats) }, { label: ar ? "خطط مالية" : "Financial plans", value: String(projects.budgetedProjects) }] };
}

export function SoftwareReportsWorkspace({ locale, workspace }: { locale: Locale; workspace: SoftwareWorkspaceData }) {
  const ar = locale === "ar";
  const [active, setActive] = useState<ReportId>("sales");
  const report = reportData(active, workspace, locale);

  function exportCsv() {
    const output: SoftwareRouteExport = { filename: `jenan-${active}-report.csv`, headers: report.headers, rows: report.rows };
    const url = URL.createObjectURL(new Blob([serializeSoftwareCsv(output)], { type: "text/csv;charset=utf-8" }));
    const download = document.createElement("a");
    download.href = url;
    download.download = output.filename;
    download.click();
    URL.revokeObjectURL(url);
  }

  return <section className="software-unified-reports" data-report-section={active}>
    <nav aria-label={ar ? "أنواع التقارير" : "Report types"}>{(Object.keys(reportLabels) as ReportId[]).map((id) => <button aria-pressed={active === id} className={active === id ? "is-active" : ""} key={id} onClick={() => setActive(id)} type="button">{ar ? reportLabels[id][0] : reportLabels[id][1]}</button>)}</nav>
    <article className="software-unified-reports__document studio-print-area"><header><div><span>JENAN PRO · {active.toUpperCase()}</span><h2>{report.title}</h2><p>{workspace.company.name} · {new Intl.DateTimeFormat(ar ? "ar-SA" : "en-GB", { dateStyle: "long" }).format(new Date())}</p></div><div><button disabled={!report.rows.length} onClick={exportCsv} type="button">CSV</button><button onClick={() => window.print()} type="button"><Icon name="briefcase" />{ar ? "طباعة / PDF" : "Print / PDF"}</button></div></header><section className="software-unified-reports__provenance"><strong>{report.source}</strong><span>{report.caveat}</span></section><section className="software-unified-reports__metrics">{report.metrics.map((metric, index) => <article key={metric.label}><span>{String(index + 1).padStart(2, "0")}</span><strong>{metric.value}</strong><small>{metric.label}</small></article>)}</section><div className="software-table-wrap"><table className="software-table"><thead><tr>{report.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{report.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{String(cell ?? "—")}</td>)}</tr>)}</tbody></table></div>{!report.rows.length ? <div className="software-empty"><Icon name="activity" /><p>{ar ? "لا توجد سجلات في هذا التقرير." : "No records are available for this report."}</p></div> : null}</article>
  </section>;
}