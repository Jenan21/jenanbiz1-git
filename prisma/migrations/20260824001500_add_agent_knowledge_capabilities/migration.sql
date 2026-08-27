-- CreateEnum
CREATE TYPE "GenomeCapabilityType" AS ENUM ('ROLE', 'GEOGRAPHY', 'LANGUAGE', 'PERMISSION', 'TOOL', 'MODEL_POLICY');

-- AlterTable
ALTER TABLE "AcademicExperience" ADD COLUMN "knowledgeEntryId" TEXT;

-- CreateTable
CREATE TABLE "AgentLanguageProficiency" (
    "profileId" TEXT NOT NULL,
    "languageCode" TEXT NOT NULL,
    "proficiency" "SkillProficiencyLevel" NOT NULL DEFAULT 'TRAINEE',
    "businessLanguage" BOOLEAN NOT NULL DEFAULT false,
    "localTerminology" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentLanguageProficiency_pkey" PRIMARY KEY ("profileId","languageCode")
);

-- CreateTable
CREATE TABLE "AgentGenomeCapability" (
    "id" TEXT NOT NULL,
    "genomeId" TEXT NOT NULL,
    "type" "GenomeCapabilityType" NOT NULL,
    "key" TEXT NOT NULL,
    "version" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentGenomeCapability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicExperience_knowledgeEntryId_key" ON "AcademicExperience"("knowledgeEntryId");
CREATE INDEX "AgentLanguageProficiency_languageCode_proficiency_idx" ON "AgentLanguageProficiency"("languageCode", "proficiency");
CREATE UNIQUE INDEX "AgentGenomeCapability_genomeId_type_key_key" ON "AgentGenomeCapability"("genomeId", "type", "key");
CREATE INDEX "AgentGenomeCapability_type_key_idx" ON "AgentGenomeCapability"("type", "key");

-- AddForeignKey
ALTER TABLE "AcademicExperience" ADD CONSTRAINT "AcademicExperience_knowledgeEntryId_fkey" FOREIGN KEY ("knowledgeEntryId") REFERENCES "SharedKnowledge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CurriculumChangeProposal" ADD CONSTRAINT "CurriculumChangeProposal_sourceExperienceId_fkey" FOREIGN KEY ("sourceExperienceId") REFERENCES "AcademicExperience"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "AgentLanguageProficiency" ADD CONSTRAINT "AgentLanguageProficiency_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AgentGenomeCapability" ADD CONSTRAINT "AgentGenomeCapability_genomeId_fkey" FOREIGN KEY ("genomeId") REFERENCES "AgentGenome"("id") ON DELETE CASCADE ON UPDATE CASCADE;