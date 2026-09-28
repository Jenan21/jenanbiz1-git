import type { SoftwareWorkspaceData } from "@/components/software/software-erp-types";
import type { SoftwareRouteId } from "@/lib/software/software-routes";
import type { Locale } from "@/types/i18n";

export const SOFTWARE_EXPORT_ROUTE_IDS = new Set<SoftwareRouteId>([
  "sales-customers", "sales-quotes", "sales-orders", "sales-invoices", "sales-receipts", "sales-products", "sales-returns",
  "hr-employees", "hr-attendance", "hr-leave", "hr-payroll", "hr-performance", "inventory", "crm", "projects", "pos", "purchases", "company",
]);

export type SoftwareRouteExport = { filename: string; headers: string[]; rows: Array<Array<number | string | null | undefined>> };

function date(value: string | null) {
  return value ? new Date(value).toISOString() : "";
}

export function buildSoftwareRouteExport(routeId: SoftwareRouteId, workspace: SoftwareWorkspaceData, locale: Locale): SoftwareRouteExport | null {
  const ar = locale === "ar";
  const documentKind = routeId === "sales-quotes" ? "QUOTE" : routeId === "sales-orders" ? "ORDER" : routeId === "sales-invoices" ? "INVOICE" : routeId === "sales-returns" ? "RETURN" : null;
  if (documentKind) return { filename: `jenan-${documentKind.toLowerCase()}s.csv`, headers: [ar ? "الرقم" : "Number", ar ? "العميل" : "Customer", ar ? "الإجمالي (هللة)" : "Total minor", ar ? "الضريبة (هللة)" : "Tax minor", ar ? "العملة" : "Currency", ar ? "الحالة" : "Status", ar ? "التاريخ" : "Date"], rows: workspace.sales.documents.filter((document) => document.kind === documentKind).map((document) => [document.number, document.customer?.name, document.totalMinor, document.taxMinor, document.currency, document.status, date(document.issuedAt)]) };
  if (routeId === "sales-customers") return { filename: "jenan-customers.csv", headers: [ar ? "العميل" : "Customer", ar ? "البريد" : "Email", ar ? "الهاتف" : "Phone", ar ? "الرقم الضريبي" : "Tax number", ar ? "الحالة" : "Status"], rows: workspace.sales.customers.map((customer) => [customer.name, customer.email, customer.phone, customer.taxNumber, customer.status]) };
  if (routeId === "sales-products") return { filename: "jenan-products.csv", headers: ["SKU", ar ? "المنتج" : "Product", ar ? "السعر (هللة)" : "Price minor", ar ? "التكلفة (هللة)" : "Cost minor", ar ? "العملة" : "Currency", ar ? "المخزون" : "Stock", ar ? "إعادة الطلب" : "Reorder"], rows: workspace.sales.products.map((product) => [product.sku, product.name, product.priceMinor, product.costMinor, product.currency, product.stockQuantity, product.reorderLevel]) };
  if (routeId === "sales-receipts") return { filename: "jenan-receipts.csv", headers: [ar ? "الفاتورة" : "Invoice", ar ? "المبلغ (هللة)" : "Amount minor", ar ? "العملة" : "Currency", ar ? "المرجع" : "Reference", ar ? "التاريخ" : "Date"], rows: workspace.sales.receipts.map((receipt) => [receipt.document?.number ?? receipt.documentId, receipt.amountMinor, receipt.currency, receipt.reference, date(receipt.receivedAt)]) };
  if (routeId.startsWith("hr-") && !workspace.company.currentUserIsOwner) return null;
  if (routeId === "hr-employees") return { filename: "jenan-employees.csv", headers: [ar ? "الرقم" : "Number", ar ? "الاسم" : "Name", ar ? "البريد" : "Email", ar ? "المسمى" : "Role", ar ? "الراتب (هللة)" : "Salary minor", ar ? "العملة" : "Currency", ar ? "الحالة" : "Status", ar ? "التعيين" : "Hired"], rows: workspace.hr.employees.map((employee) => [employee.employeeNumber, employee.name, employee.email, employee.roleTitle, employee.salaryMinor, employee.currency, employee.status, date(employee.hiredAt)]) };
  if (routeId === "hr-attendance") return { filename: "jenan-attendance.csv", headers: [ar ? "الموظف" : "Employee", ar ? "الرقم" : "Number", ar ? "التاريخ" : "Date", ar ? "الحالة" : "Status", ar ? "الدخول" : "Check in", ar ? "الخروج" : "Check out", ar ? "ملاحظة" : "Note"], rows: workspace.hr.attendance.map((record) => [record.employee.name, record.employee.employeeNumber, date(record.date), record.status, date(record.checkInAt), date(record.checkOutAt), record.note]) };
  if (routeId === "hr-leave") return { filename: "jenan-leave.csv", headers: [ar ? "الموظف" : "Employee", ar ? "من" : "Start", ar ? "إلى" : "End", ar ? "السبب" : "Reason", ar ? "الحالة" : "Status"], rows: workspace.hr.leaveRequests.map((request) => [request.employee.name, date(request.startDate), date(request.endDate), request.reason, request.status]) };
  if (routeId === "hr-payroll") return { filename: "jenan-payroll.csv", headers: [ar ? "بداية الفترة" : "Period start", ar ? "نهاية الفترة" : "Period end", ar ? "الإجمالي (هللة)" : "Gross minor", ar ? "الصافي (هللة)" : "Net minor", ar ? "الحالة" : "Status", ar ? "الترحيل" : "Posted"], rows: workspace.hr.payrollRuns.map((run) => [date(run.periodStart), date(run.periodEnd), run.totalGrossMinor, run.totalNetMinor, run.status, date(run.postedAt)]) };
  if (routeId === "hr-performance") return { filename: "jenan-performance.csv", headers: [ar ? "الموظف" : "Employee", ar ? "الفترة" : "Period", ar ? "النتيجة" : "Score", ar ? "الملخص" : "Summary", ar ? "التاريخ" : "Date"], rows: workspace.hr.reviews.map((review) => [review.employee.name, review.period, review.score, review.summary, date(review.reviewedAt)]) };
  if (routeId === "inventory") return { filename: "jenan-inventory-movements.csv", headers: ["SKU", ar ? "المنتج" : "Product", ar ? "الحركة" : "Movement", ar ? "الكمية" : "Quantity", ar ? "الملاحظة" : "Note", ar ? "التاريخ" : "Date"], rows: workspace.operations.movements.map((movement) => [movement.product.sku, movement.product.name, movement.type, movement.quantity, movement.note, date(movement.occurredAt)]) };
  if (routeId === "crm") return { filename: "jenan-crm.csv", headers: [ar ? "الفرصة" : "Opportunity", ar ? "التواصل" : "Contact", ar ? "المصدر" : "Source", ar ? "القيمة (هللة)" : "Value minor", ar ? "العملة" : "Currency", ar ? "الحالة" : "Status", ar ? "الخطوة التالية" : "Next action", ar ? "التحديث" : "Updated"], rows: workspace.operations.leads.map((lead) => [lead.name, lead.contact, lead.source, lead.valueMinor, lead.currency, lead.status, lead.nextAction, date(lead.updatedAt)]) };
  if (routeId === "projects") return { filename: "jenan-operational-projects.csv", headers: [ar ? "المشروع" : "Project", ar ? "الحالة" : "Status", ar ? "المرحلة" : "Phase", ar ? "آخر تحديث" : "Updated"], rows: workspace.operations.projects.map((project) => [project.name, project.status, project.currentPhase, date(project.updatedAt)]) };
  if (routeId === "purchases") return { filename: "jenan-purchases.csv", headers: [ar ? "الطلب" : "Order", ar ? "المورد" : "Supplier", ar ? "الإجمالي (هللة)" : "Total minor", ar ? "العملة" : "Currency", ar ? "الحالة" : "Status", ar ? "المتوقع" : "Expected", ar ? "الاستلام" : "Received"], rows: workspace.operations.purchaseOrders.map((order) => [order.number, order.supplier?.name, order.totalMinor, order.currency, order.status, date(order.expectedAt), date(order.receivedAt)]) };
  if (routeId === "pos") return { filename: "jenan-pos-shifts.csv", headers: [ar ? "الحالة" : "Status", ar ? "النقد الافتتاحي (هللة)" : "Opening cash minor", ar ? "النقد الختامي (هللة)" : "Closing cash minor", ar ? "المبيعات" : "Sales", ar ? "الفتح" : "Opened", ar ? "الإغلاق" : "Closed"], rows: workspace.operations.posShifts.map((shift) => [shift.status, shift.openingCashMinor, shift.closingCashMinor, shift.sales.length, date(shift.openedAt), date(shift.closedAt)]) };
  if (routeId === "company") return { filename: "jenan-branches.csv", headers: [ar ? "الكود" : "Code", ar ? "الفرع" : "Branch", ar ? "الدولة" : "Country", ar ? "المدينة" : "City", ar ? "العنوان" : "Address", ar ? "الحالة" : "Status"], rows: workspace.company.softwareBranches.map((branch) => [branch.code, branch.name, branch.countryCode, branch.city, branch.address, branch.status]) };
  return null;
}

function safeCsvCell(value: number | string | null | undefined) {
  const raw = String(value ?? "");
  const protectedValue = /^[\t\r ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${protectedValue.replaceAll('"', '""')}"`;
}

export function serializeSoftwareCsv(output: SoftwareRouteExport) {
  return `\uFEFF${[output.headers, ...output.rows].map((row) => row.map(safeCsvCell).join(",")).join("\r\n")}`;
}