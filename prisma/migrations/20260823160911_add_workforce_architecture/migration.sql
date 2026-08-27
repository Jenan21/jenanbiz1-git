-- CreateEnum
CREATE TYPE "SkillRelationType" AS ENUM ('RELATED', 'REQUIRED_TOOL', 'REQUIRED_KNOWLEDGE', 'REQUIRED_CERTIFICATION');

-- CreateEnum
CREATE TYPE "SkillRiskLevel" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "AcademyProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'RETIRED');

-- CreateEnum
CREATE TYPE "CurriculumVersionStatus" AS ENUM ('DRAFT', 'REVIEW', 'APPROVED', 'RETIRED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "CandidateBatchStatus" AS ENUM ('DRAFT', 'QUEUED', 'PROCESSING', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "AcademyCohortStatus" AS ENUM ('PLANNED', 'OPEN', 'ACTIVE', 'COMPLETED', 'PAUSED');

-- CreateEnum
CREATE TYPE "WorkforceGapStatus" AS ENUM ('OPEN', 'PLANNED', 'FILLED', 'PAUSED');

-- CreateEnum
CREATE TYPE "RuntimeAllocationStatus" AS ENUM ('ALLOCATED', 'RELEASED', 'FAILED');

-- CreateEnum
CREATE TYPE "GeographyNodeType" AS ENUM ('WORLD', 'COUNTRY', 'STATE', 'REGION', 'CITY', 'DISTRICT', 'TOWN', 'VILLAGE', 'LOCAL_ZONE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "GeographicKnowledgeState" AS ENUM ('VERIFIED', 'HIGH_CONFIDENCE', 'ESTIMATED', 'OUTDATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "GeographicSourceType" AS ENUM ('PUBLIC', 'LICENSED', 'AUTHORIZED', 'AGGREGATED', 'ANONYMIZED');

-- CreateEnum
CREATE TYPE "CurriculumChangeStatus" AS ENUM ('PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'APPLIED', 'ROLLED_BACK');

-- CreateEnum
CREATE TYPE "AcademicReviewRole" AS ENUM ('INSTRUCTOR', 'EXAMINER', 'INDEPENDENT_REVIEWER', 'CERTIFICATION_MANAGER');

-- CreateEnum
CREATE TYPE "AcademyRoleScope" AS ENUM ('ADMIN', 'CURRICULUM_MANAGER', 'INSTRUCTOR', 'EXAMINER', 'REVIEWER', 'CERTIFICATION_MANAGER', 'WORKFORCE_MANAGER', 'GEOGRAPHIC_INTELLIGENCE_MANAGER', 'READ_ONLY_AUDITOR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AcademyLifecycleStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "AcademyLifecycleStatus" ADD VALUE 'THEORY_QUALIFIED';
ALTER TYPE "AcademyLifecycleStatus" ADD VALUE 'PRACTICAL_QUALIFIED';
ALTER TYPE "AcademyLifecycleStatus" ADD VALUE 'SPECIALIZATION_PROJECT';
ALTER TYPE "AcademyLifecycleStatus" ADD VALUE 'FAILED';
ALTER TYPE "AcademyLifecycleStatus" ADD VALUE 'REDIRECTED';
ALTER TYPE "AcademyLifecycleStatus" ADD VALUE 'SUSPENDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CertificationRecordStatus" ADD VALUE 'RECERTIFICATION_REQUIRED';
ALTER TYPE "CertificationRecordStatus" ADD VALUE 'SUSPENDED';

-- AlterTable
ALTER TABLE "AcademyCourse" ADD COLUMN     "curriculumVersionId" TEXT;

-- AlterTable
ALTER TABLE "AcademyExam" ADD COLUMN     "maxAttempts" INTEGER,
ADD COLUMN     "rubricVersion" TEXT NOT NULL DEFAULT 'v1',
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "AcademyField" ADD COLUMN     "collegeId" TEXT;

-- AlterTable
ALTER TABLE "ExamAttempt" ADD COLUMN     "curriculumVersionId" TEXT,
ADD COLUMN     "evaluatorIdentity" TEXT,
ADD COLUMN     "evidence" JSONB,
ADD COLUMN     "reviewerIdentity" TEXT,
ADD COLUMN     "rubricVersion" TEXT NOT NULL DEFAULT 'v1';

-- AlterTable
ALTER TABLE "RobotAcademicProfile" ADD COLUMN     "lastVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "operationalAt" TIMESTAMP(3),
ADD COLUMN     "probationStartedAt" TIMESTAMP(3),
ADD COLUMN     "qualityScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reliabilityScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "safetyScore" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "trustScore" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Skill" ADD COLUMN     "riskLevel" "SkillRiskLevel" NOT NULL DEFAULT 'LOW';

-- AlterTable
ALTER TABLE "Specialization" ADD COLUMN     "disciplineId" TEXT;

-- AlterTable
ALTER TABLE "WorkforceDemand" ADD COLUMN     "expectedGraduationAt" TIMESTAMP(3),
ADD COLUMN     "priority" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "requiredCount" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "AcademyCollege" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyCollege_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyDiscipline" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyDiscipline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademySubspecialization" (
    "id" TEXT NOT NULL,
    "specializationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademySubspecialization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillRelation" (
    "sourceSkillId" TEXT NOT NULL,
    "targetSkillId" TEXT NOT NULL,
    "relationType" "SkillRelationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillRelation_pkey" PRIMARY KEY ("sourceSkillId","targetSkillId","relationType")
);

-- CreateTable
CREATE TABLE "SkillResourceRequirement" (
    "id" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "relationType" "SkillRelationType" NOT NULL,
    "resourceKey" TEXT NOT NULL,
    "resourceVersion" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillResourceRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyProgram" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "specializationId" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "AcademyProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "estimatedTheoryHours" INTEGER NOT NULL DEFAULT 0,
    "requiredTheoryHours" INTEGER NOT NULL DEFAULT 0,
    "requiredLabHours" INTEGER NOT NULL DEFAULT 0,
    "requiredPracticeHours" INTEGER NOT NULL DEFAULT 0,
    "requiredProjectHours" INTEGER NOT NULL DEFAULT 0,
    "minimumPracticeCount" INTEGER NOT NULL DEFAULT 0,
    "minimumCalendarDays" INTEGER,
    "maximumCompletionWindow" INTEGER,
    "probationHours" INTEGER NOT NULL DEFAULT 0,
    "recertificationIntervalDays" INTEGER,
    "minimumMasteryScore" INTEGER NOT NULL DEFAULT 70,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyProgram_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumVersion" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "CurriculumVersionStatus" NOT NULL DEFAULT 'DRAFT',
    "changeSummary" TEXT,
    "source" TEXT,
    "approvedAt" TIMESTAMP(3),
    "retiredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyCohort" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "programId" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "AcademyCohortStatus" NOT NULL DEFAULT 'PLANNED',
    "capacity" INTEGER,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyCohort_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortEnrollment" (
    "cohortId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "enrolledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CohortEnrollment_pkey" PRIMARY KEY ("cohortId","profileId")
);

-- CreateTable
CREATE TABLE "CandidateBatch" (
    "id" TEXT NOT NULL,
    "demandId" TEXT,
    "name" TEXT NOT NULL,
    "status" "CandidateBatchStatus" NOT NULL DEFAULT 'DRAFT',
    "requestedCount" INTEGER NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CandidateBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateBatchMember" (
    "batchId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateBatchMember_pkey" PRIMARY KEY ("batchId","profileId")
);

-- CreateTable
CREATE TABLE "WorkforceGap" (
    "id" TEXT NOT NULL,
    "demandId" TEXT NOT NULL,
    "requiredCount" INTEGER NOT NULL DEFAULT 0,
    "availableCount" INTEGER NOT NULL DEFAULT 0,
    "inTrainingCount" INTEGER NOT NULL DEFAULT 0,
    "gapCount" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkforceGapStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceGap_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRuntimeAllocation" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "missionId" TEXT,
    "robotTaskId" TEXT,
    "runtimeKey" TEXT NOT NULL,
    "status" "RuntimeAllocationStatus" NOT NULL DEFAULT 'ALLOCATED',
    "allocatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "releasedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRuntimeAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeographyNode" (
    "id" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "GeographyNodeType" NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeographyNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentGeographyProfile" (
    "profileId" TEXT NOT NULL,
    "geographyNodeId" TEXT NOT NULL,
    "proficiency" "SkillProficiencyLevel" NOT NULL DEFAULT 'TRAINEE',
    "market" TEXT,
    "language" TEXT,
    "knowledgeFreshness" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentGeographyProfile_pkey" PRIMARY KEY ("profileId","geographyNodeId")
);

-- CreateTable
CREATE TABLE "GeographicKnowledge" (
    "id" TEXT NOT NULL,
    "geographyNodeId" TEXT NOT NULL,
    "industry" TEXT,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceType" "GeographicSourceType" NOT NULL,
    "observedAt" TIMESTAMP(3),
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validFrom" TIMESTAMP(3),
    "validUntil" TIMESTAMP(3),
    "resolution" TEXT,
    "confidence" INTEGER NOT NULL DEFAULT 0,
    "verificationState" "GeographicKnowledgeState" NOT NULL DEFAULT 'UNKNOWN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeographicKnowledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicExperience" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "missionId" TEXT,
    "evidenceId" TEXT,
    "title" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "complexity" INTEGER NOT NULL DEFAULT 0,
    "risk" "SkillRiskLevel" NOT NULL DEFAULT 'LOW',
    "qualityScore" INTEGER NOT NULL DEFAULT 0,
    "validated" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademicExperience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumChangeProposal" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "curriculumVersionId" TEXT,
    "sourceExperienceId" TEXT,
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "status" "CurriculumChangeStatus" NOT NULL DEFAULT 'PROPOSED',
    "proposedVersion" INTEGER,
    "reviewerIdentity" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurriculumChangeProposal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttemptReview" (
    "id" TEXT NOT NULL,
    "examAttemptId" TEXT NOT NULL,
    "reviewerIdentity" TEXT NOT NULL,
    "role" "AcademicReviewRole" NOT NULL,
    "score" INTEGER,
    "verdict" "ReviewVerdict" NOT NULL DEFAULT 'DEFER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamAttemptReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificationReview" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "certificationId" TEXT NOT NULL,
    "reviewerIdentity" TEXT NOT NULL,
    "verdict" "ReviewVerdict" NOT NULL DEFAULT 'DEFER',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CertificationReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicProbation" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "missionCount" INTEGER NOT NULL DEFAULT 0,
    "successCount" INTEGER NOT NULL DEFAULT 0,
    "restricted" BOOLEAN NOT NULL DEFAULT true,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "AcademicProbation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicPromotionEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skillId" TEXT,
    "fromLevel" "SkillProficiencyLevel",
    "toLevel" "SkillProficiencyLevel",
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicPromotionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyRole" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "scope" "AcademyRoleScope" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyStaffAssignment" (
    "id" TEXT NOT NULL,
    "academyRoleId" TEXT NOT NULL,
    "userId" TEXT,
    "robotId" TEXT,
    "profileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyStaffAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCollege_academyId_key_key" ON "AcademyCollege"("academyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyDiscipline_fieldId_key_key" ON "AcademyDiscipline"("fieldId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "AcademySubspecialization_specializationId_key_key" ON "AcademySubspecialization"("specializationId", "key");

-- CreateIndex
CREATE INDEX "SkillRelation_targetSkillId_relationType_idx" ON "SkillRelation"("targetSkillId", "relationType");

-- CreateIndex
CREATE UNIQUE INDEX "SkillResourceRequirement_skillId_relationType_resourceKey_key" ON "SkillResourceRequirement"("skillId", "relationType", "resourceKey");

-- CreateIndex
CREATE INDEX "AcademyProgram_status_specializationId_idx" ON "AcademyProgram"("status", "specializationId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyProgram_academyId_key_key" ON "AcademyProgram"("academyId", "key");

-- CreateIndex
CREATE INDEX "CurriculumVersion_programId_status_idx" ON "CurriculumVersion"("programId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumVersion_programId_version_key" ON "CurriculumVersion"("programId", "version");

-- CreateIndex
CREATE INDEX "AcademyCohort_status_startsAt_idx" ON "AcademyCohort"("status", "startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCohort_academyId_key_key" ON "AcademyCohort"("academyId", "key");

-- CreateIndex
CREATE INDEX "CohortEnrollment_profileId_idx" ON "CohortEnrollment"("profileId");

-- CreateIndex
CREATE INDEX "CandidateBatch_status_priority_idx" ON "CandidateBatch"("status", "priority");

-- CreateIndex
CREATE INDEX "CandidateBatch_demandId_idx" ON "CandidateBatch"("demandId");

-- CreateIndex
CREATE INDEX "CandidateBatchMember_profileId_idx" ON "CandidateBatchMember"("profileId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkforceGap_demandId_key" ON "WorkforceGap"("demandId");

-- CreateIndex
CREATE INDEX "WorkforceGap_status_gapCount_idx" ON "WorkforceGap"("status", "gapCount");

-- CreateIndex
CREATE INDEX "AgentRuntimeAllocation_robotId_status_idx" ON "AgentRuntimeAllocation"("robotId", "status");

-- CreateIndex
CREATE INDEX "AgentRuntimeAllocation_runtimeKey_status_idx" ON "AgentRuntimeAllocation"("runtimeKey", "status");

-- CreateIndex
CREATE INDEX "GeographyNode_type_code_idx" ON "GeographyNode"("type", "code");

-- CreateIndex
CREATE UNIQUE INDEX "GeographyNode_parentId_type_name_key" ON "GeographyNode"("parentId", "type", "name");

-- CreateIndex
CREATE INDEX "AgentGeographyProfile_geographyNodeId_proficiency_idx" ON "AgentGeographyProfile"("geographyNodeId", "proficiency");

-- CreateIndex
CREATE INDEX "GeographicKnowledge_geographyNodeId_verificationState_valid_idx" ON "GeographicKnowledge"("geographyNodeId", "verificationState", "validUntil");

-- CreateIndex
CREATE INDEX "GeographicKnowledge_industry_confidence_idx" ON "GeographicKnowledge"("industry", "confidence");

-- CreateIndex
CREATE INDEX "AcademicExperience_profileId_validated_createdAt_idx" ON "AcademicExperience"("profileId", "validated", "createdAt");

-- CreateIndex
CREATE INDEX "CurriculumChangeProposal_academyId_status_idx" ON "CurriculumChangeProposal"("academyId", "status");

-- CreateIndex
CREATE INDEX "ExamAttemptReview_examAttemptId_role_idx" ON "ExamAttemptReview"("examAttemptId", "role");

-- CreateIndex
CREATE INDEX "CertificationReview_profileId_certificationId_createdAt_idx" ON "CertificationReview"("profileId", "certificationId", "createdAt");

-- CreateIndex
CREATE INDEX "AcademicProbation_profileId_completedAt_idx" ON "AcademicProbation"("profileId", "completedAt");

-- CreateIndex
CREATE INDEX "AcademicPromotionEvent_profileId_createdAt_idx" ON "AcademicPromotionEvent"("profileId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyRole_academyId_key_key" ON "AcademyRole"("academyId", "key");

-- CreateIndex
CREATE INDEX "AcademyStaffAssignment_academyRoleId_idx" ON "AcademyStaffAssignment"("academyRoleId");

-- CreateIndex
CREATE INDEX "AcademyStaffAssignment_userId_idx" ON "AcademyStaffAssignment"("userId");

-- CreateIndex
CREATE INDEX "AcademyStaffAssignment_robotId_idx" ON "AcademyStaffAssignment"("robotId");

-- AddForeignKey
ALTER TABLE "AcademyField" ADD CONSTRAINT "AcademyField_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "AcademyCollege"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialization" ADD CONSTRAINT "Specialization_disciplineId_fkey" FOREIGN KEY ("disciplineId") REFERENCES "AcademyDiscipline"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCourse" ADD CONSTRAINT "AcademyCourse_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCollege" ADD CONSTRAINT "AcademyCollege_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyDiscipline" ADD CONSTRAINT "AcademyDiscipline_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "AcademyField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademySubspecialization" ADD CONSTRAINT "AcademySubspecialization_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillRelation" ADD CONSTRAINT "SkillRelation_sourceSkillId_fkey" FOREIGN KEY ("sourceSkillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillRelation" ADD CONSTRAINT "SkillRelation_targetSkillId_fkey" FOREIGN KEY ("targetSkillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillResourceRequirement" ADD CONSTRAINT "SkillResourceRequirement_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyProgram" ADD CONSTRAINT "AcademyProgram_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyProgram" ADD CONSTRAINT "AcademyProgram_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumVersion" ADD CONSTRAINT "CurriculumVersion_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AcademyProgram"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCohort" ADD CONSTRAINT "AcademyCohort_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCohort" ADD CONSTRAINT "AcademyCohort_programId_fkey" FOREIGN KEY ("programId") REFERENCES "AcademyProgram"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortEnrollment" ADD CONSTRAINT "CohortEnrollment_cohortId_fkey" FOREIGN KEY ("cohortId") REFERENCES "AcademyCohort"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortEnrollment" ADD CONSTRAINT "CohortEnrollment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateBatch" ADD CONSTRAINT "CandidateBatch_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "WorkforceDemand"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateBatchMember" ADD CONSTRAINT "CandidateBatchMember_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CandidateBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateBatchMember" ADD CONSTRAINT "CandidateBatchMember_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceGap" ADD CONSTRAINT "WorkforceGap_demandId_fkey" FOREIGN KEY ("demandId") REFERENCES "WorkforceDemand"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRuntimeAllocation" ADD CONSTRAINT "AgentRuntimeAllocation_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRuntimeAllocation" ADD CONSTRAINT "AgentRuntimeAllocation_missionId_fkey" FOREIGN KEY ("missionId") REFERENCES "Mission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRuntimeAllocation" ADD CONSTRAINT "AgentRuntimeAllocation_robotTaskId_fkey" FOREIGN KEY ("robotTaskId") REFERENCES "RobotTask"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeographyNode" ADD CONSTRAINT "GeographyNode_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "GeographyNode"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGeographyProfile" ADD CONSTRAINT "AgentGeographyProfile_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGeographyProfile" ADD CONSTRAINT "AgentGeographyProfile_geographyNodeId_fkey" FOREIGN KEY ("geographyNodeId") REFERENCES "GeographyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeographicKnowledge" ADD CONSTRAINT "GeographicKnowledge_geographyNodeId_fkey" FOREIGN KEY ("geographyNodeId") REFERENCES "GeographyNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicExperience" ADD CONSTRAINT "AcademicExperience_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumChangeProposal" ADD CONSTRAINT "CurriculumChangeProposal_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumChangeProposal" ADD CONSTRAINT "CurriculumChangeProposal_curriculumVersionId_fkey" FOREIGN KEY ("curriculumVersionId") REFERENCES "CurriculumVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttemptReview" ADD CONSTRAINT "ExamAttemptReview_examAttemptId_fkey" FOREIGN KEY ("examAttemptId") REFERENCES "ExamAttempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificationReview" ADD CONSTRAINT "CertificationReview_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicProbation" ADD CONSTRAINT "AcademicProbation_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicPromotionEvent" ADD CONSTRAINT "AcademicPromotionEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyRole" ADD CONSTRAINT "AcademyRole_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyStaffAssignment" ADD CONSTRAINT "AcademyStaffAssignment_academyRoleId_fkey" FOREIGN KEY ("academyRoleId") REFERENCES "AcademyRole"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyStaffAssignment" ADD CONSTRAINT "AcademyStaffAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyStaffAssignment" ADD CONSTRAINT "AcademyStaffAssignment_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyStaffAssignment" ADD CONSTRAINT "AcademyStaffAssignment_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
