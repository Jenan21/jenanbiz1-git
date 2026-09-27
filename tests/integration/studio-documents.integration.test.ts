import { afterAll, describe, expect, it } from "vitest";

import { db } from "@/lib/db";
import { createStudioDocument, getStudioDocument, listStudioActivity, listStudioDocuments, restoreStudioDocument, updateStudioDocument } from "@/services/studio/studio-document-service";

const suffix = crypto.randomUUID().slice(0, 8);
let ownerId: string | undefined;
let otherUserId: string | undefined;
let documentId: string | undefined;

afterAll(async () => {
  if (documentId) await db.auditLog.deleteMany({ where: { entityType: "StudioDocument", entityId: documentId } });
  if (ownerId) await db.user.delete({ where: { id: ownerId } });
  if (otherUserId) await db.user.delete({ where: { id: otherUserId } });
  await db.$disconnect();
});

describe("Studio document versions", () => {
  it("creates, updates, restores, and isolates an owned document", async () => {
    const owner = await db.user.create({ data: { email: `studio-owner-${suffix}@example.test`, status: "ACTIVE" } });
    const otherUser = await db.user.create({ data: { email: `studio-other-${suffix}@example.test`, status: "ACTIVE" } });
    ownerId = owner.id;
    otherUserId = otherUser.id;

    const created = await createStudioDocument({ kind: "DOCS", title: "Operating memo", content: { body: "Version one" } }, owner.id);
    documentId = created.id;
    expect(created.currentVersion).toBe(1);
    expect(created.versions).toHaveLength(1);

    const updated = await updateStudioDocument(created.id, { kind: "DOCS", title: "Operating memo", content: { body: "Version two" } }, owner.id);
    expect(updated.currentVersion).toBe(2);
    expect(updated.versions.map((version) => version.version)).toEqual([2, 1]);

    const restored = await restoreStudioDocument(created.id, 1, owner.id);
    expect(restored.currentVersion).toBe(3);
    expect(restored.content).toEqual({ body: "Version one" });
    expect((await listStudioDocuments(owner.id, "DOCS"))[0]?.id).toBe(created.id);

    expect(await getStudioDocument(created.id, otherUser.id)).toBeNull();
    await expect(updateStudioDocument(created.id, { kind: "DOCS", title: "No access", content: {} }, otherUser.id)).rejects.toThrow("not found");
    expect(await db.auditLog.count({ where: { entityType: "StudioDocument", entityId: created.id } })).toBe(3);
    expect((await listStudioActivity(owner.id)).map((entry) => entry.action)).toEqual([
      "studio.document.restored",
      "studio.document.updated",
      "studio.document.created",
    ]);
  });
});