CREATE TABLE "PlatformSocialLink" (
  "id" TEXT NOT NULL,
  "platform" "CommunitySocialPlatform" NOT NULL,
  "url" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformSocialLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PlatformSocialLink_platform_key" ON "PlatformSocialLink"("platform");