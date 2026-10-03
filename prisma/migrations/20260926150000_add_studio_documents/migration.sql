CREATE TYPE "StudioDocumentKind" AS ENUM ('DOCS', 'SHEETS', 'PRESENTATION', 'LOGO', 'LETTERHEAD', 'CV');

CREATE TABLE "StudioDocument" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "kind" "StudioDocumentKind" NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "currentVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "StudioDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "StudioDocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StudioDocumentVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "StudioDocument_ownerId_kind_updatedAt_idx" ON "StudioDocument"("ownerId", "kind", "updatedAt");
CREATE UNIQUE INDEX "StudioDocumentVersion_documentId_version_key" ON "StudioDocumentVersion"("documentId", "version");
CREATE INDEX "StudioDocumentVersion_documentId_createdAt_idx" ON "StudioDocumentVersion"("documentId", "createdAt");

ALTER TABLE "StudioDocument" ADD CONSTRAINT "StudioDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudioDocumentVersion" ADD CONSTRAINT "StudioDocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "StudioDocument"("id") ON DELETE CASCADE ON UPDATE CASCADE;