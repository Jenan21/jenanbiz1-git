import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { db } from "@/lib/db";
import { EmailNotVerifiedError } from "@/lib/auth/email-verification-policy";
import { createProject, getUserProject } from "@/services/projects/project-service";
import {
  acceptProjectInvitation,
  declineProjectInvitation,
  inviteProjectMember,
  listReceivedProjectInvitations,
  listSentProjectInvitations,
  revokeProjectInvitation,
} from "@/services/projects/project-invitations";
import type { EmailProvider } from "@/services/providers.contracts";

const suffix = crypto.randomUUID().slice(0, 8);
const ids: Record<string, string> = {};
const emails: Record<string, string> = {};
const projectIds: string[] = [];

async function makeUser(label: string, verified = true) {
  const email = `invite-${label}-${suffix}@example.test`;
  const user = await db.user.create({
    data: {
      email,
      status: "ACTIVE",
      emailVerifiedAt: verified ? new Date() : null,
      profile: { create: { displayName: `Invite ${label} ${suffix}`, locale: "en", language: "en" } },
    },
  });
  ids[label] = user.id;
  emails[label] = email;
}

async function freshProject(name: string) {
  const project = await createProject({ name: `${name} ${suffix}` }, ids.owner);
  projectIds.push(project.id);
  return project.id;
}

const invite = (projectId: string, label: string, role: "EDITOR" | "REVIEWER" | "VIEWER" = "VIEWER", userId = ids.owner) =>
  inviteProjectMember(projectId, { email: emails[label], role }, userId, { provider: null });

beforeAll(async () => {
  await Promise.all(["owner", "invitee", "other", "member"].map((label) => makeUser(label)));
  await makeUser("unverified", false);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  const userIds = Object.values(ids);
  if (projectIds.length) await db.project.deleteMany({ where: { id: { in: projectIds } } });
  if (userIds.length) await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

describe("project invitations", () => {
  it("grants nothing until the invited person accepts", async () => {
    const projectId = await freshProject("Invite basics");
    const sent = await invite(projectId, "invitee", "EDITOR");
    expect(sent.invitation).toMatchObject({ projectId, email: emails.invitee, role: "EDITOR", status: "PENDING" });
    expect(sent.delivery).toBe("unavailable");
    expect(await getUserProject(projectId, ids.invitee)).toBeNull();

    const joined = await acceptProjectInvitation(sent.invitation.id, ids.invitee);
    expect(joined).toEqual({ projectId, role: "EDITOR" });
    const view = await getUserProject(projectId, ids.invitee);
    expect(view?.members.map((member) => member.role).sort()).toEqual(["EDITOR", "OWNER"]);
    expect(await db.projectMember.findUnique({ where: { projectId_userId: { projectId, userId: ids.invitee } } })).toMatchObject({ addedById: ids.owner, role: "EDITOR" });
  });

  it("answers the same way whether or not an account exists for the address", async () => {
    const projectId = await freshProject("Invite oracle");
    const registered = await invite(projectId, "other");
    const stranger = await inviteProjectMember(projectId, { email: `nobody-${suffix}@example.test`, role: "VIEWER" }, ids.owner, { provider: null });
    expect(Object.keys(stranger).sort()).toEqual(Object.keys(registered).sort());
    expect(Object.keys(stranger.invitation).sort()).toEqual(Object.keys(registered.invitation).sort());
    expect(stranger.delivery).toBe(registered.delivery);
  });

  it("only lets an owner invite, and not themselves or someone already on the team", async () => {
    const projectId = await freshProject("Invite rules");
    await expect(invite(projectId, "other", "VIEWER", ids.invitee)).rejects.toThrow("Project owner access required");
    await expect(inviteProjectMember(projectId, { email: emails.owner, role: "VIEWER" }, ids.owner, { provider: null })).rejects.toThrow("Project owner is already a member");

    const first = await invite(projectId, "member", "REVIEWER");
    await acceptProjectInvitation(first.invitation.id, ids.member);
    await expect(invite(projectId, "member", "VIEWER")).rejects.toThrow("This person is already a project member");
    // A member who is not an owner cannot invite either.
    await expect(invite(projectId, "other", "VIEWER", ids.member)).rejects.toThrow("Project owner access required");
  });

  it("does not let anyone else accept, decline or even confirm the existence of an invitation", async () => {
    const projectId = await freshProject("Invite theft");
    const sent = await invite(projectId, "invitee");
    const wrongPerson = acceptProjectInvitation(sent.invitation.id, ids.other);
    const missing = acceptProjectInvitation("ckdoesnotexistaaaaaaaaaaaaa", ids.other);
    await expect(wrongPerson).rejects.toThrow("Invitation not found");
    await expect(missing).rejects.toThrow("Invitation not found");
    await expect(declineProjectInvitation(sent.invitation.id, ids.other)).rejects.toThrow("Invitation not found");
    expect(await getUserProject(projectId, ids.other)).toBeNull();
    expect(await db.projectInvitation.findUnique({ where: { id: sent.invitation.id } })).toMatchObject({ status: "PENDING" });
  });

  it("accepts once even when two requests race", async () => {
    const projectId = await freshProject("Invite race");
    const sent = await invite(projectId, "invitee", "EDITOR");
    const results = await Promise.allSettled([acceptProjectInvitation(sent.invitation.id, ids.invitee), acceptProjectInvitation(sent.invitation.id, ids.invitee)]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await db.projectMember.count({ where: { projectId, userId: ids.invitee } })).toBe(1);
    await expect(acceptProjectInvitation(sent.invitation.id, ids.invitee)).rejects.toThrow("This invitation is no longer open");
  });

  it("lets the invited person decline and the owner invite again afterwards", async () => {
    const projectId = await freshProject("Invite decline");
    const sent = await invite(projectId, "invitee");
    expect(await declineProjectInvitation(sent.invitation.id, ids.invitee)).toEqual({ projectId });
    await expect(acceptProjectInvitation(sent.invitation.id, ids.invitee)).rejects.toThrow("This invitation is no longer open");
    expect(await getUserProject(projectId, ids.invitee)).toBeNull();

    const again = await invite(projectId, "invitee", "REVIEWER");
    expect(again.invitation.id).toBe(sent.invitation.id);
    expect(again.invitation).toMatchObject({ status: "PENDING", role: "REVIEWER" });
    await acceptProjectInvitation(again.invitation.id, ids.invitee);
    expect(await getUserProject(projectId, ids.invitee)).not.toBeNull();
  });

  it("lets the owner cancel an open invitation, and nobody else", async () => {
    const projectId = await freshProject("Invite revoke");
    const sent = await invite(projectId, "invitee");
    await expect(revokeProjectInvitation(projectId, sent.invitation.id, ids.other)).rejects.toThrow("Project owner access required");
    expect(await listSentProjectInvitations(ids.owner)).toEqual(expect.arrayContaining([expect.objectContaining({ id: sent.invitation.id })]));

    expect(await revokeProjectInvitation(projectId, sent.invitation.id, ids.owner)).toEqual({ id: sent.invitation.id });
    await expect(revokeProjectInvitation(projectId, sent.invitation.id, ids.owner)).rejects.toThrow("Invitation not found");
    await expect(acceptProjectInvitation(sent.invitation.id, ids.invitee)).rejects.toThrow("This invitation is no longer open");
    expect((await listSentProjectInvitations(ids.owner)).some((item) => item.id === sent.invitation.id)).toBe(false);
  });

  it("expires after fourteen days and is renewed by a new invitation", async () => {
    const projectId = await freshProject("Invite expiry");
    const sent = await invite(projectId, "invitee");
    const lifetime = sent.invitation.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(13.9 * 86_400_000);
    expect(lifetime).toBeLessThanOrEqual(14 * 86_400_000);

    await db.projectInvitation.update({ where: { id: sent.invitation.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    await expect(acceptProjectInvitation(sent.invitation.id, ids.invitee)).rejects.toThrow("This invitation has expired");
    expect((await listReceivedProjectInvitations(ids.invitee)).invitations.some((item) => item.id === sent.invitation.id)).toBe(false);

    const renewed = await invite(projectId, "invitee");
    expect(renewed.invitation.expiresAt.getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    await acceptProjectInvitation(renewed.invitation.id, ids.invitee);
  });

  it("shows received invitations only to the account with that address and without anything private", async () => {
    const projectId = await freshProject("Invite inbox");
    const sent = await invite(projectId, "invitee", "VIEWER");
    const mine = await listReceivedProjectInvitations(ids.invitee);
    const entry = mine.invitations.find((item) => item.id === sent.invitation.id);
    expect(entry).toMatchObject({ role: "VIEWER", project: { id: projectId }, invitedByName: `Invite owner ${suffix}` });
    expect(JSON.stringify(entry)).not.toMatch(/@|passwordHash|emailVerifiedAt/);
    expect((await listReceivedProjectInvitations(ids.other)).invitations.some((item) => item.id === sent.invitation.id)).toBe(false);
  });

  it("keeps a higher role when the person already belongs to the project", async () => {
    const projectId = await freshProject("Invite role");
    const sent = await invite(projectId, "invitee", "VIEWER");
    await db.projectMember.create({ data: { projectId, userId: ids.invitee, addedById: ids.owner, role: "EDITOR" } });
    expect(await acceptProjectInvitation(sent.invitation.id, ids.invitee)).toEqual({ projectId, role: "EDITOR" });
  });

  it("requires a verified address when verification is required", async () => {
    vi.stubEnv("REQUIRE_EMAIL_VERIFICATION", "true");
    const projectId = await freshProject("Invite verified");
    await expect(invite(projectId, "other", "VIEWER", ids.unverified)).rejects.toBeInstanceOf(EmailNotVerifiedError);

    const sent = await invite(projectId, "unverified");
    const inbox = await listReceivedProjectInvitations(ids.unverified);
    expect(inbox).toEqual({ invitations: [], requiresVerification: true });
    await expect(acceptProjectInvitation(sent.invitation.id, ids.unverified)).rejects.toBeInstanceOf(EmailNotVerifiedError);
    await expect(declineProjectInvitation(sent.invitation.id, ids.unverified)).rejects.toBeInstanceOf(EmailNotVerifiedError);

    await db.user.update({ where: { id: ids.unverified }, data: { emailVerifiedAt: new Date() } });
    expect(await acceptProjectInvitation(sent.invitation.id, ids.unverified)).toEqual({ projectId, role: "VIEWER" });
    await db.user.update({ where: { id: ids.unverified }, data: { emailVerifiedAt: null } });
  });

  it("mails the invitation once per quiet window and survives a provider failure", async () => {
    const projectId = await freshProject("Invite mail");
    const send = vi.fn<EmailProvider["send"]>().mockResolvedValue({ messageId: "m-1" });
    const provider: EmailProvider = { name: "test", send };

    const first = await inviteProjectMember(projectId, { email: emails.invitee, role: "VIEWER" }, ids.owner, { provider });
    expect(first.delivery).toBe("email");
    expect(send).toHaveBeenCalledTimes(1);
    const message = send.mock.calls[0]![0];
    expect(message.to).toBe(emails.invitee);
    expect(message.subject).toContain("Jenan PRO");
    expect(message.text).toContain(`Invite owner ${suffix}`);
    expect(message.text).toContain("Invite mail");

    const repeat = await inviteProjectMember(projectId, { email: emails.invitee, role: "VIEWER" }, ids.owner, { provider });
    expect(repeat.delivery).toBe("skipped");
    expect(send).toHaveBeenCalledTimes(1);

    const failing: EmailProvider = { name: "failing", send: vi.fn().mockRejectedValue(new Error("provider down")) };
    const other = await inviteProjectMember(projectId, { email: emails.other, role: "VIEWER" }, ids.owner, { provider: failing });
    expect(other.invitation.status).toBe("PENDING");
    expect(await db.auditLog.count({ where: { actorId: ids.owner, action: "project.invitation.delivery_failed", entityId: other.invitation.id } })).toBe(1);
  });

  it("hands delivery to the scheduler when one is given", async () => {
    const projectId = await freshProject("Invite scheduled");
    const send = vi.fn<EmailProvider["send"]>().mockResolvedValue({ messageId: "m-2" });
    const tasks: Array<() => Promise<void>> = [];
    await inviteProjectMember(projectId, { email: emails.other, role: "VIEWER" }, ids.owner, { provider: { name: "test", send }, schedule: (task) => tasks.push(task) });
    expect(send).not.toHaveBeenCalled();
    await tasks[0]!();
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("removes invitations together with their project", async () => {
    const projectId = await freshProject("Invite cascade");
    const sent = await invite(projectId, "invitee");
    await db.project.delete({ where: { id: projectId } });
    projectIds.splice(projectIds.indexOf(projectId), 1);
    expect(await db.projectInvitation.findUnique({ where: { id: sent.invitation.id } })).toBeNull();
  });
});
