# [70% BASELINE][PASS] Jenan Software Full Flow

## Implemented pages and routes

- `/software` live ERP dashboard.
- Sales dashboard plus customers, quotes, orders, invoices, receipts, products, returns, and reports.
- Accounting dashboard backed by posted financial entries.
- HR dashboard plus employees, attendance, leave, payroll, and performance.
- Inventory, CRM, operational projects, POS, purchases, company management, and unified reports.
- All 24 routes from references 088–111 are allowlisted and active.

## Functional QA

- Organization-scoped access is enforced for every record; sensitive HR changes require organization-owner access.
- Customers and products persist with contact, tax, pricing, cost, stock, and reorder data.
- Quotes, orders, invoices, and returns use server-calculated integer-minor-unit totals and tax.
- Sales documents follow controlled status transitions; only accepted orders/returns change inventory.
- Invoice receipts reject overpayment, mark fully collected invoices paid, and post matching income entries.
- CRM leads persist value, source, next action, and pipeline status.
- Inventory adjustments reject negative resulting stock and preserve an auditable movement ledger.
- Purchase receiving updates stock/cost and posts a matching expense entry.
- POS requires one open shift, validates stock, records a paid invoice/receipt/income entry, and calculates closing variance.
- HR persists employees, daily attendance, leave approvals, payroll runs, and performance reviews.
- Posting payroll creates a matching financial expense and cannot be repeated.
- Company view reads actual members, roles, and active programs; Projects view reads the existing Projects engine.
- Sales and unified reports use current records and support browser print/PDF.

## Responsive and visual QA

- All 24 Software routes render without document overflow.
- Dashboard, invoices, payroll, and unified reports pass at 2560x1440, 1920x1080, 1440x900, 1366x768, 1280x800, 1024x1366, 820x1180, 430x932, 390x844, and 360x800.
- Direct visual comparison completed against references 088 and 089.
- Hero, live metrics, dense module grid, sub-navigation, forms, tables, pipeline, status states, and report composition follow the Jenan PRO reference family.
- Approximate current visual fidelity: 72–76%.

## Remaining differences

- Sales and purchase forms currently create one product line per action; a multi-line document composer is reserved for the 80–90% pass.
- Customer/product edit controls, invoice detail printing, branch-aware stock locations, and barcode workflows need dedicated child experiences.
- Accounting is a deterministic operating ledger, not yet a full double-entry chart of accounts with journal posting and statutory statements.
- Payroll currently handles base salary and service-level deductions; benefits, overtime, statutory rules, and payslips require country-specific policy configuration.
- Excel/PDF report generation is not exposed; browser print/PDF is the supported report output.

## Engineering checks

- Prisma validate, generate, and migrations: passed (`20260927051500_add_jenan_software_core`, `20260927052500_fix_payroll_employee_cascade`).
- Software route and domain suites: 5 passed.
- Software E2E sales/payroll/route/responsive flow: passed.
- Full platform user journey after catalog migration: passed.
- ESLint: passed.
- TypeScript: passed.
- Production build: passed (108 routes generated).
- Snyk Code tool was required by repository instructions but is unavailable in the current tool environment; no dependencies were added.