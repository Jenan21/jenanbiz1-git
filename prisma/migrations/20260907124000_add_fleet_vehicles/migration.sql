CREATE TYPE "FleetVehicleStatus" AS ENUM ('ACTIVE', 'MAINTENANCE', 'INACTIVE');

CREATE TABLE "FleetVehicle" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "plateNumber" TEXT NOT NULL,
  "status" "FleetVehicleStatus" NOT NULL DEFAULT 'ACTIVE',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FleetVehicle_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FleetVehicle_organizationId_plateNumber_key" ON "FleetVehicle"("organizationId", "plateNumber");
CREATE INDEX "FleetVehicle_organizationId_status_idx" ON "FleetVehicle"("organizationId", "status");
ALTER TABLE "FleetVehicle" ADD CONSTRAINT "FleetVehicle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;