-- CreateEnum
CREATE TYPE "AcademyLifecycleStatus" AS ENUM ('CANDIDATE', 'ENROLLED', 'STUDYING', 'THEORY_EXAM', 'LAB', 'PRACTICAL_EXAM', 'BLIND_CHALLENGE', 'CERTIFICATION_REVIEW', 'CERTIFIED', 'PROBATION', 'OPERATIONAL', 'REMEDIAL_TRAINING', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "SkillProficiencyLevel" AS ENUM ('TRAINEE', 'JUNIOR', 'QUALIFIED', 'ADVANCED', 'EXPERT', 'ELITE');

-- CreateEnum
CREATE TYPE "AcademicAssessmentType" AS ENUM ('THEORY', 'PRACTICAL', 'BLIND', 'REAL_WORLD');

-- CreateEnum
CREATE TYPE "AcademicAssessmentOutcome" AS ENUM ('PENDING', 'PASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "CourseProgressStatus" AS ENUM ('ASSIGNED', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "CertificationRecordStatus" AS ENUM ('PENDING', 'CERTIFIED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "RetrainingStatus" AS ENUM ('ASSIGNED', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "AIProviderReadiness" AS ENUM ('NOT_REQUIRED', 'AWAITING_AI_PROVIDER', 'READY');

-- CreateEnum
CREATE TYPE "WorkforceDemandStatus" AS ENUM ('OPEN', 'PAUSED', 'FILLED');

-- AlterTable
ALTER TABLE "Robot" ADD COLUMN     "genomeId" TEXT;

-- CreateTable
CREATE TABLE "AgentGenome" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "runtimeModel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentGenome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillPack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgePack" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentGenomeSkillPack" (
    "genomeId" TEXT NOT NULL,
    "skillPackId" TEXT NOT NULL,

    CONSTRAINT "AgentGenomeSkillPack_pkey" PRIMARY KEY ("genomeId","skillPackId")
);

-- CreateTable
CREATE TABLE "AgentGenomeKnowledgePack" (
    "genomeId" TEXT NOT NULL,
    "knowledgePackId" TEXT NOT NULL,

    CONSTRAINT "AgentGenomeKnowledgePack_pkey" PRIMARY KEY ("genomeId","knowledgePackId")
);

-- CreateTable
CREATE TABLE "Academy" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Academy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyField" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialization" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Specialization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL,
    "specializationId" TEXT,
    "parentSkillId" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Skill_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillPrerequisite" (
    "skillId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,

    CONSTRAINT "SkillPrerequisite_pkey" PRIMARY KEY ("skillId","prerequisiteId")
);

-- CreateTable
CREATE TABLE "AcademyCourse" (
    "id" TEXT NOT NULL,
    "academyId" TEXT NOT NULL,
    "fieldId" TEXT,
    "specializationId" TEXT,
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyLesson" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "content" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyLesson_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyLab" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "instructions" TEXT,
    "providerReadiness" "AIProviderReadiness" NOT NULL DEFAULT 'NOT_REQUIRED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyLab_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademyExam" (
    "id" TEXT NOT NULL,
    "courseId" TEXT,
    "specializationId" TEXT,
    "title" TEXT NOT NULL,
    "assessmentType" "AcademicAssessmentType" NOT NULL,
    "passingScore" INTEGER NOT NULL DEFAULT 70,
    "critical" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyExam_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CourseSkill" (
    "courseId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,

    CONSTRAINT "CourseSkill_pkey" PRIMARY KEY ("courseId","skillId")
);

-- CreateTable
CREATE TABLE "AcademyCertification" (
    "id" TEXT NOT NULL,
    "specializationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "expiresAfterDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AcademyCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CertificationRequirement" (
    "id" TEXT NOT NULL,
    "certificationId" TEXT NOT NULL,
    "skillId" TEXT,
    "examId" TEXT,
    "minimumLevel" "SkillProficiencyLevel" NOT NULL DEFAULT 'TRAINEE',
    "minimumTheoryScore" INTEGER NOT NULL DEFAULT 0,
    "minimumPracticalScore" INTEGER NOT NULL DEFAULT 0,
    "minimumBlindScore" INTEGER NOT NULL DEFAULT 0,
    "minimumRealWorldScore" INTEGER NOT NULL DEFAULT 0,
    "hardFailureGate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CertificationRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotAcademicProfile" (
    "id" TEXT NOT NULL,
    "robotId" TEXT NOT NULL,
    "primarySpecializationId" TEXT,
    "status" "AcademyLifecycleStatus" NOT NULL DEFAULT 'CANDIDATE',
    "theoryScore" INTEGER NOT NULL DEFAULT 0,
    "practicalScore" INTEGER NOT NULL DEFAULT 0,
    "blindExamScore" INTEGER NOT NULL DEFAULT 0,
    "projectScore" INTEGER NOT NULL DEFAULT 0,
    "realWorldScore" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotAcademicProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotSecondarySpecialization" (
    "profileId" TEXT NOT NULL,
    "specializationId" TEXT NOT NULL,

    CONSTRAINT "RobotSecondarySpecialization_pkey" PRIMARY KEY ("profileId","specializationId")
);

-- CreateTable
CREATE TABLE "RobotSkill" (
    "profileId" TEXT NOT NULL,
    "skillId" TEXT NOT NULL,
    "level" "SkillProficiencyLevel" NOT NULL DEFAULT 'TRAINEE',
    "theoryScore" INTEGER NOT NULL DEFAULT 0,
    "practicalScore" INTEGER NOT NULL DEFAULT 0,
    "blindScore" INTEGER NOT NULL DEFAULT 0,
    "realWorldScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotSkill_pkey" PRIMARY KEY ("profileId","skillId")
);

-- CreateTable
CREATE TABLE "CourseCompletion" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "status" "CourseProgressStatus" NOT NULL DEFAULT 'ASSIGNED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExamAttempt" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "examId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "outcome" "AcademicAssessmentOutcome" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExamAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RobotCertification" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "certificationId" TEXT NOT NULL,
    "status" "CertificationRecordStatus" NOT NULL DEFAULT 'PENDING',
    "awardedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RobotCertification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RetrainingEvent" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "skillId" TEXT,
    "reason" TEXT NOT NULL,
    "status" "RetrainingStatus" NOT NULL DEFAULT 'ASSIGNED',
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RetrainingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkforceDemand" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT,
    "specializationId" TEXT,
    "skillId" TEXT,
    "title" TEXT NOT NULL,
    "demandScore" INTEGER NOT NULL DEFAULT 0,
    "status" "WorkforceDemandStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkforceDemand_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AgentGenome_key_key" ON "AgentGenome"("key");

-- CreateIndex
CREATE UNIQUE INDEX "SkillPack_key_key" ON "SkillPack"("key");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePack_key_key" ON "KnowledgePack"("key");

-- CreateIndex
CREATE UNIQUE INDEX "Academy_slug_key" ON "Academy"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyField_academyId_key_key" ON "AcademyField"("academyId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Specialization_fieldId_key_key" ON "Specialization"("fieldId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Skill_key_key" ON "Skill"("key");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCourse_academyId_code_key" ON "AcademyCourse"("academyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyLesson_courseId_sequence_key" ON "AcademyLesson"("courseId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyLab_courseId_sequence_key" ON "AcademyLab"("courseId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "AcademyCertification_key_key" ON "AcademyCertification"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RobotAcademicProfile_robotId_key" ON "RobotAcademicProfile"("robotId");

-- CreateIndex
CREATE INDEX "RobotAcademicProfile_status_idx" ON "RobotAcademicProfile"("status");

-- CreateIndex
CREATE INDEX "RobotAcademicProfile_primarySpecializationId_idx" ON "RobotAcademicProfile"("primarySpecializationId");

-- CreateIndex
CREATE INDEX "RobotSkill_skillId_level_idx" ON "RobotSkill"("skillId", "level");

-- CreateIndex
CREATE UNIQUE INDEX "CourseCompletion_profileId_courseId_key" ON "CourseCompletion"("profileId", "courseId");

-- CreateIndex
CREATE INDEX "ExamAttempt_profileId_examId_createdAt_idx" ON "ExamAttempt"("profileId", "examId", "createdAt");

-- CreateIndex
CREATE INDEX "RobotCertification_status_expiresAt_idx" ON "RobotCertification"("status", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RobotCertification_profileId_certificationId_key" ON "RobotCertification"("profileId", "certificationId");

-- CreateIndex
CREATE INDEX "RetrainingEvent_profileId_status_idx" ON "RetrainingEvent"("profileId", "status");

-- CreateIndex
CREATE INDEX "WorkforceDemand_status_demandScore_idx" ON "WorkforceDemand"("status", "demandScore");

-- AddForeignKey
ALTER TABLE "Robot" ADD CONSTRAINT "Robot_genomeId_fkey" FOREIGN KEY ("genomeId") REFERENCES "AgentGenome"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGenomeSkillPack" ADD CONSTRAINT "AgentGenomeSkillPack_genomeId_fkey" FOREIGN KEY ("genomeId") REFERENCES "AgentGenome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGenomeSkillPack" ADD CONSTRAINT "AgentGenomeSkillPack_skillPackId_fkey" FOREIGN KEY ("skillPackId") REFERENCES "SkillPack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGenomeKnowledgePack" ADD CONSTRAINT "AgentGenomeKnowledgePack_genomeId_fkey" FOREIGN KEY ("genomeId") REFERENCES "AgentGenome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentGenomeKnowledgePack" ADD CONSTRAINT "AgentGenomeKnowledgePack_knowledgePackId_fkey" FOREIGN KEY ("knowledgePackId") REFERENCES "KnowledgePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyField" ADD CONSTRAINT "AcademyField_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Specialization" ADD CONSTRAINT "Specialization_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "AcademyField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Skill" ADD CONSTRAINT "Skill_parentSkillId_fkey" FOREIGN KEY ("parentSkillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillPrerequisite" ADD CONSTRAINT "SkillPrerequisite_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillPrerequisite" ADD CONSTRAINT "SkillPrerequisite_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCourse" ADD CONSTRAINT "AcademyCourse_academyId_fkey" FOREIGN KEY ("academyId") REFERENCES "Academy"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCourse" ADD CONSTRAINT "AcademyCourse_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "AcademyField"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCourse" ADD CONSTRAINT "AcademyCourse_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyLesson" ADD CONSTRAINT "AcademyLesson_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyLab" ADD CONSTRAINT "AcademyLab_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyExam" ADD CONSTRAINT "AcademyExam_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyExam" ADD CONSTRAINT "AcademyExam_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSkill" ADD CONSTRAINT "CourseSkill_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseSkill" ADD CONSTRAINT "CourseSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademyCertification" ADD CONSTRAINT "AcademyCertification_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificationRequirement" ADD CONSTRAINT "CertificationRequirement_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "AcademyCertification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificationRequirement" ADD CONSTRAINT "CertificationRequirement_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CertificationRequirement" ADD CONSTRAINT "CertificationRequirement_examId_fkey" FOREIGN KEY ("examId") REFERENCES "AcademyExam"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotAcademicProfile" ADD CONSTRAINT "RobotAcademicProfile_robotId_fkey" FOREIGN KEY ("robotId") REFERENCES "Robot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotAcademicProfile" ADD CONSTRAINT "RobotAcademicProfile_primarySpecializationId_fkey" FOREIGN KEY ("primarySpecializationId") REFERENCES "Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotSecondarySpecialization" ADD CONSTRAINT "RobotSecondarySpecialization_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotSecondarySpecialization" ADD CONSTRAINT "RobotSecondarySpecialization_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotSkill" ADD CONSTRAINT "RobotSkill_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotSkill" ADD CONSTRAINT "RobotSkill_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCompletion" ADD CONSTRAINT "CourseCompletion_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CourseCompletion" ADD CONSTRAINT "CourseCompletion_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "AcademyCourse"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExamAttempt" ADD CONSTRAINT "ExamAttempt_examId_fkey" FOREIGN KEY ("examId") REFERENCES "AcademyExam"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotCertification" ADD CONSTRAINT "RobotCertification_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RobotCertification" ADD CONSTRAINT "RobotCertification_certificationId_fkey" FOREIGN KEY ("certificationId") REFERENCES "AcademyCertification"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrainingEvent" ADD CONSTRAINT "RetrainingEvent_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "RobotAcademicProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RetrainingEvent" ADD CONSTRAINT "RetrainingEvent_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceDemand" ADD CONSTRAINT "WorkforceDemand_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "AcademyField"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceDemand" ADD CONSTRAINT "WorkforceDemand_specializationId_fkey" FOREIGN KEY ("specializationId") REFERENCES "Specialization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkforceDemand" ADD CONSTRAINT "WorkforceDemand_skillId_fkey" FOREIGN KEY ("skillId") REFERENCES "Skill"("id") ON DELETE SET NULL ON UPDATE CASCADE;
