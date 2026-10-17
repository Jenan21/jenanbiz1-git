import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => {
  const tx = {
    $executeRaw: vi.fn(), auditLog: { create: vi.fn() },
    dataCenterSource: { findUnique: vi.fn() },
    dataCenterType: { findUnique: vi.fn() },
    dataCenterItem: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    dataCenterVersion: { create: vi.fn(), findUniqueOrThrow: vi.fn() },
    dataCenterEvent: { create: vi.fn() }, dataCenterReview: { create: vi.fn() },
    dataCenterConflict: { count: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  };
  return { tx, db: { ...tx, $transaction: vi.fn() } };
});
vi.mock("@/lib/db", () => ({ db: mocks.db }));
import { createDataCenterItem, createDataCenterVersion, reviewDataCenterItem, transitionDataCenterItem, resolveDataCenterConflict } from "@/services/data-center/service";

const admin = { id: "admin", systemRole: "ADMIN", kind: "HUMAN" as const };
const source = { id: "s", kind: "OFFICIAL", scope: "PLATFORM", freshnessDays: 90 };
const item = { id: "i", sourceId: "s", source, type: { key: "dataset", layer: "DATA", requiresIndependentReview: false }, currentVersion: 1, status: "DRAFT" };
const input = { sourceId: "s", title: "Estimated population", typeKey: "dataset", layer: "DATA" as const, content: '{"population":12}', evidenceStatus: "ESTIMATED" as const };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.db.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
  mocks.tx.dataCenterSource.findUnique.mockResolvedValue(source);
  mocks.tx.dataCenterType.findUnique.mockResolvedValue(item.type);
  mocks.tx.dataCenterItem.create.mockResolvedValue(item);
  mocks.tx.dataCenterItem.findUnique.mockResolvedValue(item);
  mocks.tx.dataCenterItem.update.mockImplementation(async ({ data }) => ({ ...item, ...data }));
  mocks.tx.dataCenterVersion.create.mockImplementation(async ({ data }) => ({ id: "v", ...data }));
  mocks.tx.dataCenterVersion.findUniqueOrThrow.mockResolvedValue({ id: "v", number: 1, evidenceStatus: "ESTIMATED", reviews: [{ decision: "APPROVED", reviewerId: admin.id }] });
  mocks.tx.dataCenterReview.create.mockResolvedValue({ id: "review" });
  mocks.tx.dataCenterConflict.count.mockResolvedValue(0);
});
describe("Data Center transactional workflows (mocked executor)", () => {
  it("creates immutable draft version, evidence factor snapshot and transactional audit", async () => {
    const result = await createDataCenterItem(input, admin);
    expect(result.status).toBe("DRAFT");
    expect(result.version.evidenceStatus).toBe("ESTIMATED");
    expect(result.version.confidence).toMatchObject({ factors: { evidence: 18 }, policyVersion: "dc-confidence-v2-seven-factors" });
    expect(Object.keys((result.version.confidence as { factors: Record<string, number> }).factors)).toHaveLength(7);
    expect(mocks.tx.auditLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ action: "data-center.item.created" }) }));
    expect(mocks.tx.dataCenterEvent.create).toHaveBeenCalledOnce();
  });
  it("never autoapproves generated proposals and blocks verified AI evidence", async () => {
    mocks.tx.dataCenterSource.findUnique.mockResolvedValue({ ...source, kind: "GENERATED" });
    await expect(createDataCenterItem({ ...input, evidenceStatus: "VERIFIED", provenance: [{ label: "x", kind: "SOURCE", reference: "x" }] }, admin)).rejects.toThrow("VERIFICATION_REQUIRES");
    expect(mocks.tx.dataCenterItem.create).not.toHaveBeenCalled();
  });
  it("derives AI origin from the trusted machine principal even if a service caller supplies HUMAN", async () => {
    mocks.tx.dataCenterSource.findUnique.mockResolvedValue({ ...source, scope: "PRIVATE", ownerId: admin.id });
    const result = await createDataCenterItem({ ...input, origin: "HUMAN" }, { ...admin, kind: "AI" });
    expect(result.version.origin).toBe("AI");
    expect(result.status).toBe("DRAFT");
  });
  it("creates a new draft version without updating old content", async () => {
    mocks.tx.dataCenterItem.findUnique.mockResolvedValue({ ...item, status: "PUBLISHED" });
    const result = await createDataCenterVersion({ title: "Revised", content: "revision", evidenceStatus: "ESTIMATED", itemId: "i", reason: "New source information" }, admin);
    expect(result.number).toBe(2);
    expect(mocks.tx.dataCenterItem.update).toHaveBeenCalledWith({ where: { id: "i" }, data: { currentVersion: 2, title: "Revised", status: "DRAFT" } });
    expect(mocks.tx.$executeRaw).toHaveBeenCalledOnce();
  });
  it("allows reviewed estimates to publish; does not require VERIFIED", async () => {
    mocks.tx.dataCenterItem.findUnique.mockResolvedValue({ ...item, status: "APPROVED" });
    await expect(transitionDataCenterItem({ itemId: "i", status: "PUBLISHED", reason: "Reviewed estimate clearly labelled" }, admin)).resolves.toMatchObject({ status: "PUBLISHED" });
  });
  it("requires a recorded review before approval and refuses unresolved conflicts", async () => {
    mocks.tx.dataCenterItem.findUnique.mockResolvedValue({ ...item, status: "IN_REVIEW" });
    mocks.tx.dataCenterVersion.findUniqueOrThrow.mockResolvedValue({ id: "v", number: 1, reviews: [] });
    await expect(transitionDataCenterItem({ itemId: "i", status: "APPROVED", reason: "review" }, admin)).rejects.toThrow("APPROVING_REVIEW_REQUIRED");
    mocks.tx.dataCenterVersion.findUniqueOrThrow.mockResolvedValue({ id: "v", number: 1, reviews: [{ decision: "APPROVED" }] });
    mocks.tx.dataCenterConflict.count.mockResolvedValue(1);
    await expect(transitionDataCenterItem({ itemId: "i", status: "APPROVED", reason: "review" }, admin)).rejects.toThrow("UNRESOLVED_CONFLICT");
    expect(mocks.tx.dataCenterItem.update).not.toHaveBeenCalled();
  });
  it("enforces independent review only when type policy requires it", async () => {
    mocks.tx.dataCenterItem.findUnique.mockResolvedValue({ ...item, status: "IN_REVIEW", type: { ...item.type, requiresIndependentReview: true } });
    mocks.tx.dataCenterVersion.findUniqueOrThrow.mockResolvedValue({ id: "v", createdById: "admin" });
    await expect(reviewDataCenterItem({ itemId: "i", decision: "APPROVED", notes: "self review" }, admin)).rejects.toThrow("INDEPENDENT_REVIEW_REQUIRED");
  });
  it("rejects invalid lifecycle shortcuts and non-admin publishing", async () => {
    await expect(transitionDataCenterItem({ itemId: "i", status: "PUBLISHED", reason: "skip" }, admin)).rejects.toThrow("INVALID_LIFECYCLE_TRANSITION");
    mocks.tx.dataCenterItem.findUnique.mockResolvedValue({ ...item, status: "APPROVED", source: { ...source, scope: "PRIVATE", ownerId: "user" } });
    await expect(transitionDataCenterItem({ itemId: "i", status: "PUBLISHED", reason: "skip" }, { id: "user", systemRole: "USER" })).rejects.toThrow("ADMIN_REQUIRED");
  });
  it("audits explicit conflict resolution without mutating evidence", async () => {
    mocks.tx.dataCenterConflict.findUnique.mockResolvedValue({ id: "c", itemId: "i", otherItemId: "other", resolvedAt: null });
    mocks.tx.dataCenterConflict.update.mockResolvedValue({ id: "c" });
    await resolveDataCenterConflict({ conflictId: "c", resolution: "KEEP_BOTH", notes: "Different methodologies; retain both labelled estimates" }, admin);
    expect(mocks.tx.dataCenterConflict.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ resolution: "KEEP_BOTH", resolvedById: "admin" }) }));
    expect(mocks.tx.dataCenterVersion.create).not.toHaveBeenCalled();
  });
});
