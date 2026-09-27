CREATE TYPE "SoftwareCustomerStatus" AS ENUM ('ACTIVE', 'INACTIVE');
CREATE TYPE "SalesDocumentKind" AS ENUM ('QUOTE', 'ORDER', 'INVOICE', 'RETURN');
CREATE TYPE "SalesDocumentStatus" AS ENUM ('DRAFT', 'ISSUED', 'ACCEPTED', 'FULFILLED', 'PAID', 'VOID');
CREATE TYPE "CrmLeadStatus" AS ENUM ('NEW', 'QUALIFIED', 'CONTACTED', 'WON', 'LOST');
CREATE TYPE "InventoryMovementType" AS ENUM ('RECEIPT', 'SALE', 'RETURN', 'ADJUSTMENT');
CREATE TYPE "SoftwareEmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'TERMINATED');
CREATE TYPE "AttendanceRecordStatus" AS ENUM ('PRESENT', 'ABSENT', 'REMOTE');
CREATE TYPE "LeaveRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');
CREATE TYPE "PayrollRunStatus" AS ENUM ('DRAFT', 'POSTED');
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('DRAFT', 'ORDERED', 'RECEIVED', 'CANCELLED');
CREATE TYPE "PosShiftStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE "SoftwareCustomer" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT, "phone" TEXT, "taxNumber" TEXT,
    "status" "SoftwareCustomerStatus" NOT NULL DEFAULT 'ACTIVE', "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SoftwareCustomer_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SoftwareProduct" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "sku" TEXT NOT NULL, "name" TEXT NOT NULL, "description" TEXT,
    "priceMinor" INTEGER NOT NULL, "costMinor" INTEGER NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'SAR',
    "stockQuantity" INTEGER NOT NULL DEFAULT 0, "reorderLevel" INTEGER NOT NULL DEFAULT 0, "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SoftwareProduct_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PosShift" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "status" "PosShiftStatus" NOT NULL DEFAULT 'OPEN',
    "openingCashMinor" INTEGER NOT NULL DEFAULT 0, "closingCashMinor" INTEGER, "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3), "openedById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PosShift_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SalesDocument" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "customerId" TEXT, "posShiftId" TEXT, "kind" "SalesDocumentKind" NOT NULL,
    "status" "SalesDocumentStatus" NOT NULL DEFAULT 'DRAFT', "number" TEXT NOT NULL, "currency" TEXT NOT NULL DEFAULT 'SAR',
    "subtotalMinor" INTEGER NOT NULL, "taxMinor" INTEGER NOT NULL, "totalMinor" INTEGER NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "dueAt" TIMESTAMP(3), "notes" TEXT, "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SalesDocument_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SalesDocumentLine" (
    "id" TEXT NOT NULL, "documentId" TEXT NOT NULL, "productId" TEXT, "description" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL, "taxRateBps" INTEGER NOT NULL DEFAULT 1500, "lineTotalMinor" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "SalesDocumentLine_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SoftwareReceipt" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "documentId" TEXT NOT NULL, "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SAR', "reference" TEXT, "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SoftwareReceipt_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "customerId" TEXT, "name" TEXT NOT NULL, "contact" TEXT, "source" TEXT,
    "valueMinor" INTEGER, "currency" TEXT NOT NULL DEFAULT 'SAR', "status" "CrmLeadStatus" NOT NULL DEFAULT 'NEW', "nextAction" TEXT,
    "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "InventoryMovement" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "productId" TEXT NOT NULL, "type" "InventoryMovementType" NOT NULL,
    "quantity" INTEGER NOT NULL, "note" TEXT, "referenceType" TEXT, "referenceId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "InventoryMovement_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SoftwareEmployee" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "memberId" TEXT, "employeeNumber" TEXT NOT NULL, "name" TEXT NOT NULL,
    "email" TEXT, "roleTitle" TEXT NOT NULL, "salaryMinor" INTEGER NOT NULL DEFAULT 0, "currency" TEXT NOT NULL DEFAULT 'SAR',
    "status" "SoftwareEmployeeStatus" NOT NULL DEFAULT 'ACTIVE', "hiredAt" TIMESTAMP(3) NOT NULL, "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SoftwareEmployee_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "AttendanceRecord" (
    "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "status" "AttendanceRecordStatus" NOT NULL,
    "checkInAt" TIMESTAMP(3), "checkOutAt" TIMESTAMP(3), "note" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "AttendanceRecord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "LeaveRequest" (
    "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "startDate" TIMESTAMP(3) NOT NULL, "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT, "status" "LeaveRequestStatus" NOT NULL DEFAULT 'PENDING', "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "LeaveRequest_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PayrollRun" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "periodStart" TIMESTAMP(3) NOT NULL, "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "PayrollRunStatus" NOT NULL DEFAULT 'DRAFT', "totalGrossMinor" INTEGER NOT NULL, "totalNetMinor" INTEGER NOT NULL,
    "postedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL, CONSTRAINT "PayrollRun_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PayrollItem" (
    "id" TEXT NOT NULL, "payrollRunId" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "grossMinor" INTEGER NOT NULL,
    "deductionsMinor" INTEGER NOT NULL DEFAULT 0, "netMinor" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PayrollItem_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PerformanceReview" (
    "id" TEXT NOT NULL, "employeeId" TEXT NOT NULL, "score" INTEGER NOT NULL, "summary" TEXT NOT NULL, "period" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "PerformanceReview_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "SoftwareSupplier" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "name" TEXT NOT NULL, "email" TEXT, "phone" TEXT, "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SoftwareSupplier_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PurchaseOrder" (
    "id" TEXT NOT NULL, "organizationId" TEXT NOT NULL, "supplierId" TEXT, "number" TEXT NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT', "currency" TEXT NOT NULL DEFAULT 'SAR', "totalMinor" INTEGER NOT NULL,
    "expectedAt" TIMESTAMP(3), "receivedAt" TIMESTAMP(3), "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "PurchaseOrderLine" (
    "id" TEXT NOT NULL, "purchaseOrderId" TEXT NOT NULL, "productId" TEXT, "description" TEXT NOT NULL, "quantity" INTEGER NOT NULL,
    "unitCostMinor" INTEGER NOT NULL, "lineTotalMinor" INTEGER NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SoftwareProduct_organizationId_sku_key" ON "SoftwareProduct"("organizationId", "sku");
CREATE UNIQUE INDEX "SalesDocument_organizationId_number_key" ON "SalesDocument"("organizationId", "number");
CREATE UNIQUE INDEX "SoftwareEmployee_memberId_key" ON "SoftwareEmployee"("memberId");
CREATE UNIQUE INDEX "SoftwareEmployee_organizationId_employeeNumber_key" ON "SoftwareEmployee"("organizationId", "employeeNumber");
CREATE UNIQUE INDEX "AttendanceRecord_employeeId_date_key" ON "AttendanceRecord"("employeeId", "date");
CREATE UNIQUE INDEX "PayrollItem_payrollRunId_employeeId_key" ON "PayrollItem"("payrollRunId", "employeeId");
CREATE UNIQUE INDEX "PurchaseOrder_organizationId_number_key" ON "PurchaseOrder"("organizationId", "number");
CREATE INDEX "SoftwareCustomer_organizationId_status_idx" ON "SoftwareCustomer"("organizationId", "status");
CREATE INDEX "SoftwareCustomer_organizationId_name_idx" ON "SoftwareCustomer"("organizationId", "name");
CREATE INDEX "SoftwareProduct_organizationId_isActive_idx" ON "SoftwareProduct"("organizationId", "isActive");
CREATE INDEX "SalesDocument_organizationId_kind_status_idx" ON "SalesDocument"("organizationId", "kind", "status");
CREATE INDEX "SalesDocument_customerId_idx" ON "SalesDocument"("customerId");
CREATE INDEX "SalesDocument_posShiftId_idx" ON "SalesDocument"("posShiftId");
CREATE INDEX "SalesDocumentLine_documentId_idx" ON "SalesDocumentLine"("documentId");
CREATE INDEX "SalesDocumentLine_productId_idx" ON "SalesDocumentLine"("productId");
CREATE INDEX "SoftwareReceipt_organizationId_receivedAt_idx" ON "SoftwareReceipt"("organizationId", "receivedAt");
CREATE INDEX "SoftwareReceipt_documentId_idx" ON "SoftwareReceipt"("documentId");
CREATE INDEX "CrmLead_organizationId_status_idx" ON "CrmLead"("organizationId", "status");
CREATE INDEX "CrmLead_customerId_idx" ON "CrmLead"("customerId");
CREATE INDEX "InventoryMovement_organizationId_occurredAt_idx" ON "InventoryMovement"("organizationId", "occurredAt");
CREATE INDEX "InventoryMovement_productId_occurredAt_idx" ON "InventoryMovement"("productId", "occurredAt");
CREATE INDEX "SoftwareEmployee_organizationId_status_idx" ON "SoftwareEmployee"("organizationId", "status");
CREATE INDEX "AttendanceRecord_date_status_idx" ON "AttendanceRecord"("date", "status");
CREATE INDEX "LeaveRequest_employeeId_status_idx" ON "LeaveRequest"("employeeId", "status");
CREATE INDEX "LeaveRequest_startDate_endDate_idx" ON "LeaveRequest"("startDate", "endDate");
CREATE INDEX "PayrollRun_organizationId_periodEnd_idx" ON "PayrollRun"("organizationId", "periodEnd");
CREATE INDEX "PayrollRun_organizationId_status_idx" ON "PayrollRun"("organizationId", "status");
CREATE INDEX "PayrollItem_employeeId_idx" ON "PayrollItem"("employeeId");
CREATE INDEX "PerformanceReview_employeeId_reviewedAt_idx" ON "PerformanceReview"("employeeId", "reviewedAt");
CREATE INDEX "SoftwareSupplier_organizationId_name_idx" ON "SoftwareSupplier"("organizationId", "name");
CREATE INDEX "PurchaseOrder_organizationId_status_idx" ON "PurchaseOrder"("organizationId", "status");
CREATE INDEX "PurchaseOrder_supplierId_idx" ON "PurchaseOrder"("supplierId");
CREATE INDEX "PurchaseOrderLine_purchaseOrderId_idx" ON "PurchaseOrderLine"("purchaseOrderId");
CREATE INDEX "PurchaseOrderLine_productId_idx" ON "PurchaseOrderLine"("productId");
CREATE INDEX "PosShift_organizationId_status_idx" ON "PosShift"("organizationId", "status");
CREATE INDEX "PosShift_openedAt_idx" ON "PosShift"("openedAt");

ALTER TABLE "SoftwareCustomer" ADD CONSTRAINT "SoftwareCustomer_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareProduct" ADD CONSTRAINT "SoftwareProduct_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PosShift" ADD CONSTRAINT "PosShift_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "SoftwareCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_posShiftId_fkey" FOREIGN KEY ("posShiftId") REFERENCES "PosShift"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SalesDocumentLine" ADD CONSTRAINT "SalesDocumentLine_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SalesDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SalesDocumentLine" ADD CONSTRAINT "SalesDocumentLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SoftwareProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SoftwareReceipt" ADD CONSTRAINT "SoftwareReceipt_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareReceipt" ADD CONSTRAINT "SoftwareReceipt_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "SalesDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "SoftwareCustomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "InventoryMovement" ADD CONSTRAINT "InventoryMovement_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SoftwareProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareEmployee" ADD CONSTRAINT "SoftwareEmployee_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareEmployee" ADD CONSTRAINT "SoftwareEmployee_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "OrganizationMember"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AttendanceRecord" ADD CONSTRAINT "AttendanceRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "SoftwareEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LeaveRequest" ADD CONSTRAINT "LeaveRequest_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "SoftwareEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollRun" ADD CONSTRAINT "PayrollRun_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "PayrollRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PayrollItem" ADD CONSTRAINT "PayrollItem_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "SoftwareEmployee"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PerformanceReview" ADD CONSTRAINT "PerformanceReview_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "SoftwareEmployee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SoftwareSupplier" ADD CONSTRAINT "SoftwareSupplier_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "SoftwareSupplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PurchaseOrderLine" ADD CONSTRAINT "PurchaseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "SoftwareProduct"("id") ON DELETE SET NULL ON UPDATE CASCADE;