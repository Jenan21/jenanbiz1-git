DO $$
BEGIN
  CREATE TYPE "PlatformChatRole" AS ENUM ('USER', 'ASSISTANT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "PlatformConversation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PlatformConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "PlatformChatMessage" (
  "id" TEXT NOT NULL,
  "conversationId" TEXT NOT NULL,
  "role" "PlatformChatRole" NOT NULL,
  "content" TEXT NOT NULL,
  "provider" TEXT,
  "model" TEXT,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "latencyMs" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PlatformChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PlatformConversation_userId_key" ON "PlatformConversation"("userId");
CREATE INDEX IF NOT EXISTS "PlatformChatMessage_conversationId_createdAt_idx" ON "PlatformChatMessage"("conversationId", "createdAt");

DO $$
BEGIN
  ALTER TABLE "PlatformConversation" ADD CONSTRAINT "PlatformConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "PlatformChatMessage" ADD CONSTRAINT "PlatformChatMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "PlatformConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;