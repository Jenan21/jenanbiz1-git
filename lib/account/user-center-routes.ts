export const USER_CENTER_ROUTES = [
  { id: "account", path: "/account", source: "ACCOUNT_RECORDS", outputs: "NONE" },
  { id: "overview", path: "/user", source: "ACCOUNT_RECORDS", outputs: "NONE" },
  { id: "investments", path: "/user/investments", source: "NOT_CONNECTED", outputs: "REPORT_LINK" },
  { id: "investment-detail", path: "/user/investment/detail", source: "NOT_CONNECTED", outputs: "REPORT_LINK" },
  { id: "community-access", path: "/user/unlocks", source: "PERSISTED_ACKNOWLEDGEMENTS", outputs: "NONE" },
  { id: "payments", path: "/user/payments", source: "PAYMENT_RECORDS", outputs: "INVOICE_LINK" },
  { id: "invoice", path: "/user/payments/invoice", source: "PAYMENT_RECORDS", outputs: "PRINT" },
  { id: "reports", path: "/user/reports", source: "PROJECT_AND_AUDIT_RECORDS", outputs: "REPORT_LINKS" },
] as const;

export type UserCenterRoute = (typeof USER_CENTER_ROUTES)[number];