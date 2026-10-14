import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AcademyResourceApprovalState, AcademyResourceKind, SystemRole, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { createAcademyResource, createAcademyResourceVersion, listAcademyResources, reviewAcademyResource } from "@/services/academy/content-library-service";
import { activateOrganizationProgram, createOrganizationForUser } from "@/services/programs/organization-program-service";
import { createFieldAssignment, listFieldAssignees, listFieldAssignments } from "@/services/programs/field-operations-service";
import { addProjectMember, createProject, getUserProject, listUserProjects, listUserProjectsPage } from "@/services/projects/project-service";
import { getSoftwareCompany } from "@/services/software/software-access";
import { applyToJob, createJobPosting, listJobPostings, listMyJobApplications, listOwnedJobApplications, listSavedJobs, listTalentMatches, saveJob, saveTalentProfile, updateJobPostingStatus } from "@/services/talent/job-service";

const suffix = crypto.randomUUID().slice(0, 8);
const phone = "+966501234567";
const city = `Privacy-City-${suffix}`;
const passwordHash = "$argon2id$v=19$m=65536,t=3,p=4$c2VjcmV0c2VjcmV0$c2VjcmV0aGFzaA";
// Anything in this list appearing in a response means a user row (or one of its private fields) travelled to somebody else.
const privateFields = new RegExp(["argon2id", "passwordHash", "systemRole", "emailVerifiedAt", "966501234567", city].join("|"));

const ids: Record<string, string> = {};
const refs: Record<string, string> = {};
const emails: Record<string, string> = {};
let organizationId = "";
let resourceId = "";
const jobIds: string[] = [];

async function makeUser(label: string, systemRole: SystemRole = SystemRole.USER) {
  const email = `sec-privacy-${label}-${suffix}@example.test`;
  const user = await db.user.create({
    data: {
      email,
      status: UserStatus.ACTIVE,
      systemRole,
      passwordHash,
      profile: { create: { displayName: `Person ${label} ${suffix}`, phone, city, locale: "en", language: "en" } },
    },
  });
  ids[label] = user.id;
  emails[label] = email;
  return user;
}

const shown = (value: unknown) => JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item));
const nameOf = (label: string) => `Person ${label} ${suffix}`;

beforeAll(async () => {
  await Promise.all([makeUser("owner"), makeUser("editor"), makeUser("reviewer"), makeUser("stranger"), makeUser("applicant"), makeUser("admin", SystemRole.ADMIN)]);
});

afterAll(async () => {
  const userIds = Object.values(ids);
  if (jobIds.length) await db.jobPosting.deleteMany({ where: { id: { in: jobIds } } });
  if (userIds.length) await db.project.deleteMany({ where: { createdById: { in: userIds } } });
  if (organizationId) await db.organization.deleteMany({ where: { id: organizationId } });
  if (resourceId) await db.academyResource.deleteMany({ where: { id: resourceId } });
  if (userIds.length) await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  if (organizationId) await db.auditLog.deleteMany({ where: { organizationId } });
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("project people", () => {
  it("answers addMember with the person's name and the address the owner typed, and nothing else", async () => {
    const project = await createProject({ name: `Privacy project ${suffix}` }, ids.owner);
    refs.project = project.id;
    const added = await addProjectMember(project.id, { email: emails.editor, role: "EDITOR" }, ids.owner);
    await addProjectMember(project.id, { email: emails.reviewer, role: "REVIEWER" }, ids.owner);

    expect(added.user).toEqual({ id: ids.editor, email: emails.editor, profile: { displayName: nameOf("editor") } });
    expect(shown(added)).not.toMatch(privateFields);
  });

  it("shows the owner the team's addresses and nobody else anyone's but their own", async () => {
    const ownerView = await getUserProject(refs.project, ids.owner);
    expect(ownerView?.members.map((member) => member.user.email).sort()).toEqual([emails.owner, emails.editor, emails.reviewer].sort());
    expect(ownerView?.createdBy).toEqual({ id: ids.owner, email: emails.owner, profile: { displayName: nameOf("owner") } });

    for (const viewer of ["editor", "reviewer"] as const) {
      const view = await getUserProject(refs.project, ids[viewer]);
      expect(view?.members).toHaveLength(3);
      for (const member of view!.members) {
        expect(member.user.profile?.displayName).toBeTruthy();
        if (member.user.id === ids[viewer]) expect(member.user.email).toBe(emails[viewer]);
        else expect(member.user).not.toHaveProperty("email");
      }
      expect(view?.createdBy).toEqual({ id: ids.owner, profile: { displayName: nameOf("owner") } });
      const text = shown(view);
      expect(text).not.toMatch(privateFields);
      for (const other of Object.keys(emails).filter((label) => label !== viewer)) expect(text).not.toContain(emails[other]);
    }
  });

  it("applies the same rule to the project lists", async () => {
    for (const viewer of ["editor", "reviewer"] as const) {
      const listed = await listUserProjects(ids[viewer]);
      const page = await listUserProjectsPage(ids[viewer], { limit: 10, offset: 0, search: `Privacy project ${suffix}` });
      expect(listed.some((project) => project.id === refs.project)).toBe(true);
      expect(page.projects).toHaveLength(1);
      for (const text of [shown(listed), shown(page)]) {
        expect(text).not.toMatch(privateFields);
        for (const other of Object.keys(emails).filter((label) => label !== viewer)) expect(text).not.toContain(emails[other]);
      }
    }
    expect((await listUserProjects(ids.stranger)).some((project) => project.id === refs.project)).toBe(false);
    expect(await getUserProject(refs.project, ids.stranger)).toBeNull();
  });
});

describe("job postings and applications", () => {
  it("lists a posting to everybody with its publisher's name only and without anybody's applications", async () => {
    const description = "Lead AI-enabled market research, build partner pipelines, manage structured experiments, coordinate sales operations, and report measurable revenue impact across business units.";
    const input = { benefits: "Flexible hybrid schedule, learning budget, and documented growth reviews.", city: "Riyadh", conditions: "Six years of relevant experience and authorization to work in the selected location.", countryCode: "SA", department: "Growth", description, requiredSkills: "market research, sales operations, ai, reporting", salaryMaxMinor: 3_200_000, salaryMinMinor: 2_400_000, workMode: "HYBRID" as const };
    const consented = await createJobPosting({ ...input, title: `Privacy role with consent ${suffix}` }, ids.owner);
    const private_ = await createJobPosting({ ...input, title: `Privacy role without consent ${suffix}` }, ids.owner);
    jobIds.push(consented.id, private_.id);
    refs.consentedJob = consented.id;
    refs.privateJob = private_.id;
    await updateJobPostingStatus(consented.id, "PUBLISHED", ids.owner);
    await updateJobPostingStatus(private_.id, "PUBLISHED", ids.owner);

    await applyToJob(consented.id, "I have market research, sales operations and reporting experience across regional teams.", ids.applicant, { shareProfile: true });
    await applyToJob(private_.id, "I would like to apply without sharing my profile details with the employer.", ids.applicant);

    for (const viewer of ["stranger", "applicant", "owner"] as const) {
      const postings = await listJobPostings(ids[viewer], { search: `Privacy role` });
      expect(postings.map((posting) => posting.id)).toEqual(expect.arrayContaining([consented.id, private_.id]));
      for (const posting of postings) {
        expect(posting).not.toHaveProperty("applications");
        expect(posting.createdBy).toEqual({ id: ids.owner, profile: { displayName: nameOf("owner") } });
      }
      const text = shown(postings);
      expect(text).not.toMatch(privateFields);
      expect(text).not.toContain(emails.owner);
      expect(text).not.toContain(emails.applicant);
      expect(text).not.toContain(ids.applicant);
    }
  });

  it("keeps the publisher's contact details out of saved jobs, matches and the applicant's own applications", async () => {
    await saveTalentProfile({ headline: "Growth operator", summary: "I build measurable growth systems across research, sales operations, automation and reporting.", skills: "market research, sales operations, ai, reporting", yearsExperience: 6, isDiscoverable: true }, ids.stranger);
    const saved = await saveJob(refs.consentedJob, ids.stranger);
    const savedList = await listSavedJobs(ids.stranger);
    const matches = await listTalentMatches(ids.stranger);
    const applications = await listMyJobApplications(ids.applicant);

    expect(matches.candidateMatches.length).toBeGreaterThan(0);
    expect(applications).toHaveLength(2);
    for (const result of [saved, savedList, matches, applications]) {
      const text = shown(result);
      expect(text).not.toMatch(privateFields);
      expect(text).not.toContain(emails.owner);
    }
    expect(saved.jobPosting).not.toHaveProperty("applications");
    expect(matches.candidateMatches.every((match) => match.posting.createdBy.id === ids.owner && !("email" in match.posting.createdBy))).toBe(true);
    expect(applications.every((application) => !("email" in application.jobPosting.createdBy))).toBe(true);
  });

  it("gives the employer an applicant's address only when the applicant consented to share their profile", async () => {
    const owned = await listOwnedJobApplications(ids.owner);
    const withConsent = owned.find((application) => application.jobPosting.id === refs.consentedJob);
    const withoutConsent = owned.find((application) => application.jobPosting.id === refs.privateJob);

    expect(withConsent?.applicant).toEqual({ email: emails.applicant, profile: { displayName: nameOf("applicant") } });
    expect(withoutConsent?.applicant).toEqual({ profile: { displayName: nameOf("applicant") } });
    expect(shown(withoutConsent)).not.toContain(emails.applicant);
    expect(shown(owned)).not.toMatch(privateFields);
  });
});

describe("organization people", () => {
  it("shows co-members by name and the owner alone the addresses", async () => {
    const organization = await createOrganizationForUser({ name: `Privacy org ${suffix}`, userId: ids.owner });
    organizationId = organization.id;
    await db.organizationMember.createMany({
      data: [
        { organizationId, userId: ids.editor, status: "ACTIVE", joinedAt: new Date() },
        { organizationId, userId: ids.reviewer, status: "INVITED" },
      ],
    });

    const ownerView = await getSoftwareCompany(organizationId, ids.owner);
    expect(ownerView.currentUserIsOwner).toBe(true);
    expect(ownerView.members.map((member) => member.user.email).sort()).toEqual([emails.owner, emails.editor, emails.reviewer].sort());

    const memberView = await getSoftwareCompany(organizationId, ids.editor);
    expect(memberView.currentUserIsOwner).toBe(false);
    expect(memberView.members).toHaveLength(3);
    for (const member of memberView.members) {
      expect(member.user.profile?.displayName).toBeTruthy();
      if (member.user.id === ids.editor) expect(member.user.email).toBe(emails.editor);
      else expect(member.user).not.toHaveProperty("email");
    }
    const text = shown(memberView);
    expect(text).not.toMatch(privateFields);
    expect(text).not.toContain(emails.owner);
    expect(text).not.toContain(emails.reviewer);
  });

  it("applies the same rule to field assignments and assignees", async () => {
    await activateOrganizationProgram({ organizationId, key: "FIELD_OPERATIONS", userId: ids.owner });
    const ownerMember = await db.organizationMember.findFirstOrThrow({ where: { organizationId, userId: ids.owner }, select: { id: true } });
    await createFieldAssignment({ organizationId, title: "Visit the privacy customer", assigneeMemberId: ownerMember.id, userId: ids.owner });

    const asOwner = shown({ assignments: await listFieldAssignments(organizationId, ids.owner), assignees: await listFieldAssignees(organizationId, ids.owner) });
    expect(asOwner).toContain(emails.owner);
    expect(asOwner).toContain(emails.editor);

    const asMember = { assignments: await listFieldAssignments(organizationId, ids.editor), assignees: await listFieldAssignees(organizationId, ids.editor) };
    const text = shown(asMember);
    expect(text).not.toMatch(privateFields);
    expect(text).not.toContain(emails.owner);
    expect(text).toContain(emails.editor);
    expect(asMember.assignments[0]?.assigneeMember?.user).toEqual({ id: ids.owner, profile: { displayName: nameOf("owner") } });
  });
});

describe("academy library", () => {
  it("shows who approved a resource by name without the approver's address", async () => {
    const resource = await createAcademyResource({ content: { body: "Draft" }, kind: AcademyResourceKind.STUDY, slug: `privacy-study-${suffix}`, title: `Privacy study ${suffix}` }, ids.admin);
    resourceId = resource.id;
    await createAcademyResourceVersion({ authorName: "Research desk", changeSummary: "Sourced", content: { body: "Approved" }, resourceId: resource.id, sourceName: "Registry", sourcePublishedAt: new Date("2026-09-01T00:00:00.000Z"), title: `Privacy study ${suffix}` }, ids.admin);
    const approved = await reviewAcademyResource(resource.id, "APPROVED", ids.admin);
    expect(approved.approvedBy).toEqual({ id: ids.admin, profile: { displayName: nameOf("admin") } });

    const listed = await listAcademyResources({ approvalState: AcademyResourceApprovalState.APPROVED, query: `Privacy study ${suffix}` });
    expect(listed.map((item) => item.id)).toContain(resource.id);
    const text = shown(listed);
    expect(text).not.toContain(emails.admin);
    expect(text).not.toMatch(privateFields);
    expect(shown(approved)).not.toContain(emails.admin);
  });
});
