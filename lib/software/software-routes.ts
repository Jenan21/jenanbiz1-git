export const SOFTWARE_FLOW_ROUTES = [
  { id: "dashboard", route: "/software/business", section: "core", title: ["Jenan Software", "Jenan Software"] },
  { id: "sales", route: "/software/sales", section: "sales", title: ["Jenan Sales", "Jenan Sales"] },
  { id: "sales-customers", route: "/software/sales/customers", section: "sales", title: ["العملاء", "Customers"] },
  { id: "sales-quotes", route: "/software/sales/quotes", section: "sales", title: ["عروض الأسعار", "Quotes"] },
  { id: "sales-orders", route: "/software/sales/orders", section: "sales", title: ["أوامر البيع", "Sales orders"] },
  { id: "sales-invoices", route: "/software/sales/invoices", section: "sales", title: ["فواتير المبيعات", "Sales invoices"] },
  { id: "sales-receipts", route: "/software/sales/receipts", section: "sales", title: ["سندات القبض", "Receipts"] },
  { id: "sales-products", route: "/software/sales/products", section: "sales", title: ["المنتجات", "Products"] },
  { id: "sales-returns", route: "/software/sales/returns", section: "sales", title: ["المرتجعات", "Returns"] },
  { id: "sales-reports", route: "/software/sales/reports", section: "sales", title: ["تقارير المبيعات", "Sales reports"] },
  { id: "accounting", route: "/software/accounting", section: "core", title: ["المحاسبة", "Accounting"] },
  { id: "hr", route: "/software/hr", section: "hr", title: ["Jenan HR", "Jenan HR"] },
  { id: "hr-employees", route: "/software/hr/employees", section: "hr", title: ["الموظفون", "Employees"] },
  { id: "hr-attendance", route: "/software/hr/attendance", section: "hr", title: ["الحضور والانصراف", "Attendance"] },
  { id: "hr-leave", route: "/software/hr/leave", section: "hr", title: ["الإجازات", "Leave"] },
  { id: "hr-payroll", route: "/software/hr/payroll", section: "hr", title: ["الرواتب", "Payroll"] },
  { id: "hr-performance", route: "/software/hr/performance", section: "hr", title: ["الأداء", "Performance"] },
  { id: "inventory", route: "/software/inventory", section: "core", title: ["المخزون", "Inventory"] },
  { id: "crm", route: "/software/crm", section: "core", title: ["إدارة علاقات العملاء", "CRM"] },
  { id: "projects", route: "/software/projects", section: "core", title: ["إدارة المشاريع التشغيلية", "Project management"] },
  { id: "pos", route: "/software/pos", section: "core", title: ["نقاط البيع", "Point of sale"] },
  { id: "purchases", route: "/software/purchases", section: "core", title: ["المشتريات", "Purchases"] },
  { id: "company", route: "/software/company", section: "core", title: ["إدارة الشركات", "Company management"] },
  { id: "reports", route: "/software/reports", section: "core", title: ["التقارير الموحدة", "Unified reports"] },
] as const;

export type SoftwareFlowRoute = (typeof SOFTWARE_FLOW_ROUTES)[number];
export type SoftwareRouteId = SoftwareFlowRoute["id"];

export function resolveSoftwareFlow(flow: string[]) {
  const route = `/software/${flow.join("/")}`;
  return SOFTWARE_FLOW_ROUTES.find((definition) => definition.route === route) ?? null;
}