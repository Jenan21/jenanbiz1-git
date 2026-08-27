import { Client } from "pg";

const fields = [
  ["software-engineering", "Software Engineering"],
  ["ui-ux-design", "UI/UX Design"],
  ["database-data-engineering", "Database & Data Engineering"],
  ["ai-engineering", "AI Engineering"],
  ["qa-testing", "QA & Testing"],
  ["security", "Security"],
  ["maintenance-operations", "Maintenance & Operations"],
  ["devops-infrastructure", "DevOps / Infrastructure"],
  ["architecture", "Architecture"],
  ["performance", "Performance"],
  ["innovation-rnd", "Innovation / R&D"],
  ["product-project-management", "Product & Project Management"],
  ["supervision", "Supervision"],
  ["management", "Management"],
  ["review", "Review"],
  ["cost-optimization", "Cost Optimization"],
  ["documentation", "Documentation"],
  ["localization", "Localization"],
];

const colleges = [
  ["technology-engineering", "Technology & Engineering"],
  ["management", "Management"],
  ["commercial", "Commercial"],
  ["finance-business", "Finance & Business"],
];

const academyRoles = [
  ["academy-director", "Academy Director", "ADMIN"],
  ["curriculum-agent", "Curriculum Agent", "CURRICULUM_MANAGER"],
  ["instructor-agent", "Instructor Agent", "INSTRUCTOR"],
  ["examiner-agent", "Examiner Agent", "EXAMINER"],
  ["independent-reviewer", "Independent Reviewer", "REVIEWER"],
  ["certification-agent", "Certification Agent", "CERTIFICATION_MANAGER"],
  ["workforce-demand-agent", "Workforce Demand Agent", "WORKFORCE_MANAGER"],
  ["geographic-intelligence-agent", "Geographic Intelligence Agent", "GEOGRAPHIC_INTELLIGENCE_MANAGER"],
  ["academy-auditor", "Academy Read-only Auditor", "READ_ONLY_AUDITOR"],
];

const academyQueues = [
  ["admission", "Admissions queue", 4],
  ["assessment", "Assessment queue", 8],
  ["certification", "Certification queue", 4],
  ["retraining", "Retraining queue", 4],
  ["geography-refresh", "Geography refresh queue", 2],
];

const client = new Client({ connectionString: process.env.DATABASE_URL });
const academyId = "academy_jenan_foundation_v1";

try {
  await client.connect();
  await client.query("BEGIN");
  await client.query(
    `INSERT INTO "Academy" ("id", "name", "slug", "description", "createdAt", "updatedAt")
     VALUES ($1, $2, $3, $4, NOW(), NOW())
     ON CONFLICT ("slug") DO UPDATE SET "name" = EXCLUDED."name", "description" = EXCLUDED."description", "updatedAt" = NOW()`,
    [academyId, "Jenan Agent Academy", "jenan-agent-academy", "Demand-driven foundation for provable agent capability."],
  );
  for (const [key, name] of colleges) {
    await client.query(
      `INSERT INTO "AcademyCollege" ("id", "academyId", "name", "key", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW()) ON CONFLICT ("academyId", "key") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = NOW()`,
      [`academy_college_${key}`, academyId, name, key],
    );
  }
  for (const [key, name, scope] of academyRoles) {
    await client.query(
      `INSERT INTO "AcademyRole" ("id", "academyId", "name", "key", "scope", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5::"AcademyRoleScope", NOW(), NOW())
       ON CONFLICT ("academyId", "key") DO UPDATE SET "name" = EXCLUDED."name", "scope" = EXCLUDED."scope", "updatedAt" = NOW()`,
      [`academy_role_${key}`, academyId, name, key, scope],
    );
  }
  for (const [key, name, concurrency] of academyQueues) {
    await client.query(
      `INSERT INTO "AcademyWorkQueue" ("id", "academyId", "name", "key", "concurrency", "paused", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, false, NOW(), NOW())
       ON CONFLICT ("academyId", "key") DO UPDATE SET "name" = EXCLUDED."name", "concurrency" = EXCLUDED."concurrency", "updatedAt" = NOW()`,
      [`academy_queue_${key}`, academyId, name, key, concurrency],
    );
  }
  await client.query(
    `INSERT INTO "AgentGenome" ("id", "name", "key", "description", "createdAt", "updatedAt")
     VALUES ('genome_jenan_foundation_v1', 'Jenan Foundation Genome', 'jenan-foundation', 'Shared identity template for academy candidates.', NOW(), NOW())
     ON CONFLICT ("key") DO NOTHING`,
  );
  await client.query(
    `INSERT INTO "SkillPack" ("id", "name", "key", "description", "createdAt", "updatedAt")
     VALUES ('skill_pack_jenan_foundation_v1', 'Jenan Foundation Skills', 'jenan-foundation-skills', 'Reusable foundation skill pack.', NOW(), NOW())
     ON CONFLICT ("key") DO NOTHING`,
  );
  await client.query(
    `INSERT INTO "KnowledgePack" ("id", "name", "key", "description", "createdAt", "updatedAt")
     VALUES ('knowledge_pack_jenan_foundation_v1', 'Jenan Foundation Knowledge', 'jenan-foundation-knowledge', 'Reusable foundation knowledge pack.', NOW(), NOW())
     ON CONFLICT ("key") DO NOTHING`,
  );
  await client.query(
    `INSERT INTO "AgentGenomeSkillPack" ("genomeId", "skillPackId") VALUES ('genome_jenan_foundation_v1', 'skill_pack_jenan_foundation_v1') ON CONFLICT DO NOTHING`,
  );
  await client.query(
    `INSERT INTO "AgentGenomeKnowledgePack" ("genomeId", "knowledgePackId") VALUES ('genome_jenan_foundation_v1', 'knowledge_pack_jenan_foundation_v1') ON CONFLICT DO NOTHING`,
  );
  for (const [type, key, version] of [["ROLE", "academy-candidate", "v1"], ["TOOL", "platform-tool-registry", "v1"], ["LANGUAGE", "ar", "v1"], ["LANGUAGE", "en", "v1"], ["MODEL_POLICY", "provider-ready", "v1"]]) {
    await client.query(
      `INSERT INTO "AgentGenomeCapability" ("id", "genomeId", "type", "key", "version", "createdAt", "updatedAt")
       VALUES ($1, 'genome_jenan_foundation_v1', $2::"GenomeCapabilityType", $3, $4, NOW(), NOW())
       ON CONFLICT ("genomeId", "type", "key") DO UPDATE SET "version" = EXCLUDED."version", "updatedAt" = NOW()`,
      [`genome_capability_${type}_${key}`, type, key, version],
    );
  }
  await client.query(
    `INSERT INTO "GeographyNode" ("id", "type", "name", "code", "createdAt", "updatedAt")
     VALUES ('geography_world', 'WORLD', 'World', 'WORLD', NOW(), NOW())
     ON CONFLICT ("parentId", "type", "name") DO NOTHING`,
  );

  for (const [key, name] of fields) {
    const fieldId = `academy_field_${key}`;
    const collegeKey = ["software-engineering", "ui-ux-design", "database-data-engineering", "ai-engineering", "qa-testing", "security", "maintenance-operations", "devops-infrastructure", "architecture", "performance", "innovation-rnd"].includes(key)
      ? "technology-engineering"
      : ["product-project-management", "supervision", "management", "review", "cost-optimization", "documentation", "localization"].includes(key)
        ? "management"
        : "commercial";
    const specializationId = `academy_specialization_${key}`;
    const skillId = `academy_skill_${key}`;
    const courseId = `academy_course_${key}`;
    const labId = `academy_lab_${key}`;
    const theoryExamId = `academy_exam_theory_${key}`;
    const practicalExamId = `academy_exam_practical_${key}`;
    const certificationId = `academy_certification_${key}`;
    const courseCode = `FOUND-${key.replaceAll("-", "_").toUpperCase()}`;
    const providerReadiness = key === "ai-engineering" ? "AWAITING_AI_PROVIDER" : "NOT_REQUIRED";

    await client.query(
      `INSERT INTO "AcademyField" ("id", "academyId", "name", "key", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       ON CONFLICT ("academyId", "key") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = NOW()`,
      [fieldId, academyId, name, key],
    );
    await client.query(`UPDATE "AcademyField" SET "collegeId" = $1, "updatedAt" = NOW() WHERE "id" = $2`, [`academy_college_${collegeKey}`, fieldId]);
    const programId = `academy_program_${key}`;
    const curriculumVersionId = `academy_curriculum_${key}_v1`;
    await client.query(
      `INSERT INTO "AcademyProgram" ("id", "academyId", "specializationId", "name", "key", "status", "estimatedTheoryHours", "requiredTheoryHours", "requiredLabHours", "requiredPracticeHours", "requiredProjectHours", "minimumPracticeCount", "probationHours", "recertificationIntervalDays", "minimumMasteryScore", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 'ACTIVE', 8, 8, 4, 4, 2, 1, 4, 365, 70, NOW(), NOW()) ON CONFLICT ("academyId", "key") DO UPDATE SET "status" = 'ACTIVE', "updatedAt" = NOW()`,
      [programId, academyId, specializationId, `${name} Foundation Program`, `${key}:foundation-program`],
    );
    await client.query(
      `INSERT INTO "CurriculumVersion" ("id", "programId", "version", "status", "changeSummary", "source", "approvedAt", "createdAt", "updatedAt")
       VALUES ($1, $2, 1, 'APPROVED', 'Initial Foundation V1 curriculum.', 'academy seed', NOW(), NOW(), NOW()) ON CONFLICT ("programId", "version") DO NOTHING`,
      [curriculumVersionId, programId],
    );
    await client.query(`UPDATE "AcademyCourse" SET "curriculumVersionId" = $1, "updatedAt" = NOW() WHERE "id" = $2`, [curriculumVersionId, courseId]);
    await client.query(
      `INSERT INTO "Specialization" ("id", "fieldId", "name", "key", "description", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Foundation', 'foundation', $3, NOW(), NOW())
       ON CONFLICT ("fieldId", "key") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = NOW()`,
      [specializationId, fieldId, `Foundational ${name} specialization.`],
    );
    await client.query(
      `INSERT INTO "Skill" ("id", "specializationId", "name", "key", "description", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT ("key") DO UPDATE SET "name" = EXCLUDED."name", "updatedAt" = NOW()`,
      [skillId, specializationId, `${name} foundations`, `${key}:foundation`, `Proven foundation skill for ${name}.`],
    );
    await client.query(
      `INSERT INTO "AcademyCourse" ("id", "academyId", "fieldId", "specializationId", "title", "code", "description", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
       ON CONFLICT ("academyId", "code") DO UPDATE SET "title" = EXCLUDED."title", "updatedAt" = NOW()`,
      [courseId, academyId, fieldId, specializationId, `${name} Foundation`, courseCode, `Course path for ${name}.`],
    );
    await client.query(`INSERT INTO "CourseSkill" ("courseId", "skillId") VALUES ($1, $2) ON CONFLICT DO NOTHING`, [courseId, skillId]);
    await client.query(
      `INSERT INTO "SkillResourceRequirement" ("id", "skillId", "relationType", "resourceKey", "resourceVersion", "description", "createdAt", "updatedAt")
       VALUES ($1, $2, 'REQUIRED_KNOWLEDGE', $3, 'v1', 'Foundation knowledge pack requirement.', NOW(), NOW()) ON CONFLICT ("skillId", "relationType", "resourceKey") DO NOTHING`,
      [`academy_skill_resource_${key}`, skillId, `jenan-foundation:${key}`],
    );
    await client.query(
      `INSERT INTO "AcademyLesson" ("id", "courseId", "title", "sequence", "content", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Foundation theory', 1, $3, NOW(), NOW())
       ON CONFLICT ("courseId", "sequence") DO UPDATE SET "title" = EXCLUDED."title", "updatedAt" = NOW()`,
      [`academy_lesson_${key}`, courseId, `Core theory for ${name}.`],
    );
    await client.query(
      `INSERT INTO "AcademyLab" ("id", "courseId", "title", "sequence", "instructions", "providerReadiness", "createdAt", "updatedAt")
       VALUES ($1, $2, 'Foundation lab', 1, $3, $4::"AIProviderReadiness", NOW(), NOW())
       ON CONFLICT ("courseId", "sequence") DO UPDATE SET "providerReadiness" = EXCLUDED."providerReadiness", "updatedAt" = NOW()`,
      [labId, courseId, `Practical lab for ${name}.`, providerReadiness],
    );
    await client.query(
      `INSERT INTO "AcademyExam" ("id", "courseId", "specializationId", "title", "assessmentType", "passingScore", "critical", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'Theory exam', 'THEORY', 70, false, NOW(), NOW()) ON CONFLICT ("id") DO NOTHING`,
      [theoryExamId, courseId, specializationId],
    );
    await client.query(
      `INSERT INTO "AcademyExam" ("id", "courseId", "specializationId", "title", "assessmentType", "passingScore", "critical", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, 'Practical exam', 'PRACTICAL', 70, true, NOW(), NOW()) ON CONFLICT ("id") DO NOTHING`,
      [practicalExamId, courseId, specializationId],
    );
    await client.query(
      `INSERT INTO "AcademyCertification" ("id", "specializationId", "name", "key", "expiresAfterDays", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 365, NOW(), NOW()) ON CONFLICT ("key") DO NOTHING`,
      [certificationId, specializationId, `${name} Foundation Certification`, `${key}:foundation-certified`],
    );
    await client.query(
      `INSERT INTO "CertificationRequirement" ("id", "certificationId", "skillId", "examId", "minimumLevel", "minimumTheoryScore", "minimumPracticalScore", "minimumBlindScore", "minimumRealWorldScore", "hardFailureGate", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, 'QUALIFIED', 70, 70, 0, 0, true, NOW(), NOW()) ON CONFLICT ("id") DO NOTHING`,
      [`academy_requirement_${key}`, certificationId, skillId, practicalExamId],
    );
    await client.query(
      `INSERT INTO "WorkforceDemand" ("id", "fieldId", "specializationId", "skillId", "title", "demandScore", "status", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, 0, 'OPEN', NOW(), NOW()) ON CONFLICT ("id") DO NOTHING`,
      [`academy_demand_${key}`, fieldId, specializationId, skillId, `${name} workforce demand`],
    );
  }

  await client.query("COMMIT");
  console.log(JSON.stringify({ academy: "jenan-agent-academy", colleges: colleges.length, fields: fields.length, roles: academyRoles.length, queues: academyQueues.length, status: "seeded" }));
} catch (error) {
  await client.query("ROLLBACK").catch(() => undefined);
  throw error;
} finally {
  await client.end();
}