-- CreateTable
CREATE TABLE "PlatformProfile" (
    "id" TEXT NOT NULL DEFAULT 'platform',
    "content" JSONB NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlatformProfile_pkey" PRIMARY KEY ("id")
);
