CREATE TYPE "CommunitySocialPlatform" AS ENUM ('FACEBOOK', 'INSTAGRAM', 'TIKTOK', 'YOUTUBE', 'SNAPCHAT', 'X');
CREATE TYPE "CommunityAccessStatus" AS ENUM ('ACTIVE', 'REVOKED');

CREATE TABLE "CommunityAccessGrant" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "CommunitySocialPlatform" NOT NULL,
  "status" "CommunityAccessStatus" NOT NULL DEFAULT 'ACTIVE',
  "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CommunityAccessGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CommunityAccessGrant_userId_platform_key" ON "CommunityAccessGrant"("userId", "platform");
CREATE INDEX "CommunityAccessGrant_userId_status_idx" ON "CommunityAccessGrant"("userId", "status");
ALTER TABLE "CommunityAccessGrant" ADD CONSTRAINT "CommunityAccessGrant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;