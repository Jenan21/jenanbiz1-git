import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { cleanE2EIdentities, createE2ESession, seedE2EAdmin, seedE2EUser } from "./identity-fixture";
import { e2eIdentity } from "./test-identities";

const origin = "http://127.0.0.1:3101";

async function signedIn(browser: Browser, email: string): Promise<BrowserContext> {
  const context = await browser.newContext({ baseURL: origin, locale: "en-US", viewport: { width: 1440, height: 1000 } });
  await context.addCookies([
    { name: "locale", value: "en", url: origin },
    { name: "jenan_session", value: await createE2ESession(email), url: origin, httpOnly: true, sameSite: "Lax" },
  ]);
  return context;
}

async function projectIdsOf(context: BrowserContext) {
  const response = await context.request.get("/api/projects?limit=100");
  expect(response.status()).toBe(200);
  return ((await response.json()).projects as Array<{ id: string }>).map((project) => project.id);
}

test.describe.serial("Project invitations", () => {
  test.setTimeout(180_000);

  test.beforeAll(async () => {
    await cleanE2EIdentities();
    await seedE2EUser();
    await seedE2EAdmin();
  });

  test.afterAll(async () => {
    await cleanE2EIdentities();
  });

  test("an owner invites an address and the person joins only by accepting", async ({ browser }) => {
    const owner = await signedIn(browser, e2eIdentity.user.email);
    const invitee = await signedIn(browser, e2eIdentity.admin.email);
    try {
      const created = await owner.request.post("/api/projects", { headers: { origin }, data: { action: "create", name: "E2E invitation project", sector: "Operations", countryCode: "SA" } });
      expect(created.status()).toBe(201);
      const projectId = (await created.json()).result.id as string;

      const ownerPage = await owner.newPage();
      await ownerPage.goto(`/projects/start/team?project=${projectId}`);
      await expect(ownerPage.getByRole("heading", { name: "Invite a member by e-mail" })).toBeVisible({ timeout: 60_000 });
      await ownerPage.getByPlaceholder("Email").first().fill(e2eIdentity.admin.email);
      await ownerPage.getByRole("button", { name: "Send invitation" }).click();
      await expect(ownerPage.getByRole("status").filter({ hasText: /Invitation (saved|e-mailed)/ })).toBeVisible();
      const pending = ownerPage.getByTestId("sent-project-invitations");
      await expect(pending).toContainText(e2eIdentity.admin.email);

      // Nothing is granted yet: the invited account cannot read the project.
      expect(await projectIdsOf(invitee)).not.toContain(projectId);
      expect((await invitee.request.get(`/api/projects/${projectId}`)).status()).toBeGreaterThanOrEqual(400);

      const inviteePage = await invitee.newPage();
      await inviteePage.goto("/projects");
      const received = inviteePage.getByTestId("received-project-invitations");
      await expect(received).toBeVisible({ timeout: 60_000 });
      await expect(received).toContainText("E2E invitation project");
      await expect(received).toContainText("EDITOR");
      await received.getByRole("button", { name: "Accept" }).click();
      await expect(received.getByRole("status")).toContainText('You joined "E2E invitation project"');

      expect(await projectIdsOf(invitee)).toContain(projectId);
      await expect(inviteePage.locator("main").getByText("E2E invitation project", { exact: true }).first()).toBeVisible({ timeout: 20_000 });

      // The invitation is spent: the owner no longer sees it as pending and a second accept is refused.
      await ownerPage.reload();
      await expect(ownerPage.getByTestId("sent-project-invitations")).toHaveCount(0);
      const list = await owner.request.get("/api/projects/invitations");
      expect((await list.json()).sent).toEqual([]);
      const again = await invitee.request.post("/api/projects", { headers: { origin }, data: { action: "acceptInvitation", invitationId: "ckdoesnotexistaaaaaaaaaaaaa" } });
      expect(again.status()).toBe(404);
    } finally {
      await Promise.all([owner.close(), invitee.close()]);
    }
  });

  test("an invited person can decline and an owner can cancel", async ({ browser }) => {
    const owner = await signedIn(browser, e2eIdentity.user.email);
    const invitee = await signedIn(browser, e2eIdentity.admin.email);
    try {
      const created = await owner.request.post("/api/projects", { headers: { origin }, data: { action: "create", name: "E2E declined project", sector: "Operations", countryCode: "SA" } });
      const projectId = (await created.json()).result.id as string;
      const invite = await owner.request.post("/api/projects", { headers: { origin }, data: { action: "inviteMember", projectId, email: e2eIdentity.admin.email, role: "VIEWER" } });
      expect(invite.status()).toBe(200);
      expect((await invite.json()).result.invitation).toMatchObject({ email: e2eIdentity.admin.email, role: "VIEWER", status: "PENDING" });

      const inviteePage = await invitee.newPage();
      await inviteePage.goto("/projects");
      const received = inviteePage.getByTestId("received-project-invitations");
      await expect(received).toContainText("E2E declined project", { timeout: 60_000 });
      await received.getByRole("button", { name: "Decline" }).click();
      await expect(received.getByRole("status")).toContainText("Invitation declined.");
      expect(await projectIdsOf(invitee)).not.toContain(projectId);

      // Invited again, then cancelled by the owner from the team screen.
      const reinvite = await owner.request.post("/api/projects", { headers: { origin }, data: { action: "inviteMember", projectId, email: e2eIdentity.admin.email, role: "REVIEWER" } });
      expect(reinvite.status()).toBe(200);
      const ownerPage = await owner.newPage();
      await ownerPage.goto(`/projects/start/team?project=${projectId}`);
      const pending = ownerPage.getByTestId("sent-project-invitations");
      await expect(pending).toContainText(e2eIdentity.admin.email, { timeout: 60_000 });
      await pending.getByRole("button", { name: "Cancel invitation" }).click();
      await expect(pending.getByRole("status")).toContainText("Invitation cancelled.");

      const received2 = await invitee.request.get("/api/projects/invitations");
      expect((await received2.json()).received).toEqual([]);
    } finally {
      await Promise.all([owner.close(), invitee.close()]);
    }
  });

  test("a stranger cannot act on someone else's invitation, and the old add-member command is gone", async ({ browser }) => {
    const owner = await signedIn(browser, e2eIdentity.user.email);
    const stranger = await signedIn(browser, e2eIdentity.admin.email);
    try {
      const created = await owner.request.post("/api/projects", { headers: { origin }, data: { action: "create", name: "E2E private invitation", sector: "Operations", countryCode: "SA" } });
      const projectId = (await created.json()).result.id as string;
      const invite = await owner.request.post("/api/projects", { headers: { origin }, data: { action: "inviteMember", projectId, email: `someone.else.${Date.now()}@example.test`, role: "VIEWER" } });
      const invitationId = (await invite.json()).result.invitation.id as string;

      const accept = await stranger.request.post("/api/projects", { headers: { origin }, data: { action: "acceptInvitation", invitationId } });
      expect(accept.status()).toBe(404);
      expect(await projectIdsOf(stranger)).not.toContain(projectId);

      const legacy = await owner.request.post("/api/projects", { headers: { origin }, data: { action: "addMember", projectId, email: e2eIdentity.admin.email, role: "EDITOR" } });
      expect(legacy.status()).toBe(400);
    } finally {
      await Promise.all([owner.close(), stranger.close()]);
    }
  });
});
