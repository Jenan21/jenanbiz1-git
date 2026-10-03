import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

import { AcademyResourceKind, SystemRole, UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import {
  addAcademyResourceAttachment,
  createAcademyResource,
  createAcademyResourceVersion,
  getApprovedAcademyResources,
  reviewAcademyResource,
} from "@/services/academy/content-library-service";

describe("academy content library", () => {
  const email = `academy.library.${randomUUID()}@example.test`;
  let actorId = "";
  let resourceId = "";

  it("preserves versions and exposes only approved, sourced content", async () => {
    const actor = await db.user.create({ data: { email, status: UserStatus.ACTIVE, systemRole: SystemRole.ADMIN } });
    actorId = actor.id;
    const resource = await createAcademyResource({
      content: { body: "Initial draft" },
      kind: AcademyResourceKind.STUDY,
      slug: `verified-study-${randomUUID()}`,
      summary: "Initial source-free draft",
      title: "Verified Study",
    }, actor.id);
    resourceId = resource.id;

    await expect(reviewAcademyResource(resource.id, "APPROVED", actor.id)).rejects.toThrow("Source name, source date, and author are required");

    const versioned = await createAcademyResourceVersion({
      authorName: "Jenan Research Desk",
      changeSummary: "Added verified source metadata",
      content: { body: "Approved study body" },
      references: [{ title: "Primary reference", url: "https://example.com/reference", source: "Example Registry" }],
      resourceId: resource.id,
      sourceName: "Example Registry",
      sourcePublishedAt: new Date("2026-09-01T00:00:00.000Z"),
      sourceUrl: "https://example.com/source",
      summary: "Verified summary",
      title: "Verified Study",
    }, actor.id);
    expect(versioned.currentVersion).toBe(2);
    expect(versioned.versions.map((item) => item.version)).toEqual([2, 1]);

    await reviewAcademyResource(resource.id, "APPROVED", actor.id);
    await addAcademyResourceAttachment({
      externalUrl: "https://example.com/attachment.pdf",
      mimeType: "application/pdf",
      resourceId: resource.id,
      sourceName: "Example Registry",
      title: "Approved attachment",
      versionId: versioned.versions[0].id,
    }, actor.id);

    const approved = await getApprovedAcademyResources({ kind: AcademyResourceKind.STUDY, query: "Verified" });
    const saved = approved.find((item) => item.id === resource.id);
    expect(saved?.approvalState).toBe("APPROVED");
    expect(saved?.versions).toHaveLength(2);
    expect(saved?.attachments[0]?.title).toBe("Approved attachment");
  });

  afterAll(async () => {
    if (resourceId) await db.academyResource.delete({ where: { id: resourceId } }).catch(() => undefined);
    if (actorId) {
      await db.auditLog.deleteMany({ where: { actorId } });
      await db.user.delete({ where: { id: actorId } }).catch(() => undefined);
    }
    await db.$disconnect();
  });
});