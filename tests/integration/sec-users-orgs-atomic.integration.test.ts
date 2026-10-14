import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { UserStatus } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { DEFAULT_MAX_EXAM_ATTEMPTS, enrollLearner, submitLearnerExamAttempt } from "@/services/academy/learner-progress-service";
import { createOrganizationForUser } from "@/services/programs/organization-program-service";
import { createPayrollRun, createSoftwareEmployee, postPayrollRun } from "@/services/software/hr-service";
import { createPurchaseOrder, updatePurchaseOrderStatus } from "@/services/software/operations-service";
import { createSalesDocument, recordSoftwareReceipt, saveSoftwareProduct, updateSalesDocumentStatus } from "@/services/software/sales-service";
import { applyToJob, createJobPosting, updateJobPostingStatus } from "@/services/talent/job-service";

const suffix = crypto.randomUUID().slice(0, 8);
const ids: Record<string, string> = {};
const organizationIds: string[] = [];
const jobIds: string[] = [];
let academyId = "";
let courseId = "";

async function makeUser(label: string) {
  const user = await db.user.create({ data: { email: `sec-atomic-${label}-${suffix}@example.test`, status: UserStatus.ACTIVE, profile: { create: { displayName: `Atomic ${label}`, locale: "en", language: "en" } } } });
  ids[label] = user.id;
}

/** Fires the same call several times at once and sorts the outcomes. */
async function race<T>(count: number, run: () => Promise<T>) {
  const settled = await Promise.allSettled(Array.from({ length: count }, () => run()));
  const succeeded = settled.flatMap((outcome) => (outcome.status === "fulfilled" ? [outcome.value] : []));
  const failures = settled.flatMap((outcome) => (outcome.status === "rejected" ? [outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason)] : []));
  return { succeeded, failures };
}

let organizationId = "";
const owner = () => ids.owner;

beforeAll(async () => {
  await Promise.all(["owner", "learner", "applicant"].map(makeUser));
  const organization = await createOrganizationForUser({ name: `Atomic org ${suffix}`, userId: ids.owner });
  organizationId = organization.id;
  organizationIds.push(organization.id);
});

afterAll(async () => {
  const userIds = Object.values(ids);
  if (jobIds.length) await db.jobPosting.deleteMany({ where: { id: { in: jobIds } } });
  if (organizationIds.length) await db.organization.deleteMany({ where: { id: { in: organizationIds } } });
  if (userIds.length) await db.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  if (organizationIds.length) await db.auditLog.deleteMany({ where: { organizationId: { in: organizationIds } } });
  if (userIds.length) await db.user.deleteMany({ where: { id: { in: userIds } } });
  if (academyId) await db.academy.deleteMany({ where: { id: academyId } });
  await db.$disconnect();
});

describe("invoice receipts", () => {
  async function issuedInvoice(label: string) {
    const product = await saveSoftwareProduct({ organizationId, userId: owner(), sku: `${label}-${suffix}`, name: `Receipt item ${label}`, priceMinor: 10_000, costMinor: 1_000 });
    const invoice = await createSalesDocument({ organizationId, userId: owner(), kind: "INVOICE", lines: [{ productId: product.id, quantity: 1, taxRateBps: 0 }] });
    await updateSalesDocumentStatus({ documentId: invoice.id, organizationId, status: "ISSUED", userId: owner() });
    return invoice;
  }

  it("books the same full payment once when two identical requests arrive together", async () => {
    const invoice = await issuedInvoice("FULL");
    const { succeeded, failures } = await race(2, () => recordSoftwareReceipt({ amountMinor: 10_000, documentId: invoice.id, organizationId, userId: owner() }));
    expect(succeeded).toHaveLength(1);
    expect(failures).toEqual(["Only issued invoices can receive payment"]);
    expect(await db.softwareReceipt.count({ where: { documentId: invoice.id } })).toBe(1);
    expect(await db.financialEntry.count({ where: { organizationId, type: "INCOME", description: { contains: invoice.number } } })).toBe(1);
    expect((await db.salesDocument.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("PAID");
  });

  it("never lets parallel partial receipts add up to more than the invoice total", async () => {
    const invoice = await issuedInvoice("PART");
    const { succeeded, failures } = await race(3, () => recordSoftwareReceipt({ amountMinor: 4_000, documentId: invoice.id, organizationId, userId: owner() }));
    expect(succeeded).toHaveLength(2);
    expect(failures).toEqual(["Receipt exceeds invoice balance"]);
    const receipts = await db.softwareReceipt.findMany({ where: { documentId: invoice.id } });
    expect(receipts.reduce((total, receipt) => total + receipt.amountMinor, 0)).toBe(8_000);
    expect((await db.salesDocument.findUniqueOrThrow({ where: { id: invoice.id } })).status).toBe("ISSUED");
  });

  it("fulfils an order once, so stock leaves the shelf once", async () => {
    const product = await saveSoftwareProduct({ organizationId, userId: owner(), sku: `FULFIL-${suffix}`, name: "Fulfilment item", priceMinor: 500, costMinor: 100, initialStock: 10 });
    const order = await createSalesDocument({ organizationId, userId: owner(), kind: "ORDER", lines: [{ productId: product.id, quantity: 3, taxRateBps: 0 }] });
    await updateSalesDocumentStatus({ documentId: order.id, organizationId, status: "ACCEPTED", userId: owner() });
    const { succeeded, failures } = await race(2, () => updateSalesDocumentStatus({ documentId: order.id, organizationId, status: "FULFILLED", userId: owner() }));
    expect(succeeded).toHaveLength(1);
    expect(failures).toEqual(["Invalid sales document status transition"]);
    expect((await db.softwareProduct.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(7);
    expect(await db.inventoryMovement.count({ where: { referenceType: "SalesDocument", referenceId: order.id } })).toBe(1);
  });
});

describe("purchase orders", () => {
  it("receive their stock and book their expense once however many receive requests arrive", async () => {
    const product = await saveSoftwareProduct({ organizationId, userId: owner(), sku: `PO-${suffix}`, name: "Purchased item", priceMinor: 900, costMinor: 100 });
    const order = await createPurchaseOrder({ organizationId, userId: owner(), lines: [{ productId: product.id, quantity: 10, unitCostMinor: 100 }] });
    await updatePurchaseOrderStatus({ orderId: order.id, organizationId, status: "ORDERED", userId: owner() });

    const { succeeded, failures } = await race(3, () => updatePurchaseOrderStatus({ orderId: order.id, organizationId, status: "RECEIVED", userId: owner() }));
    expect(succeeded).toHaveLength(1);
    expect(failures).toHaveLength(2);
    for (const failure of failures) expect(failure).toMatch(/cannot be changed|changed by another request/);
    expect((await db.softwareProduct.findUniqueOrThrow({ where: { id: product.id } })).stockQuantity).toBe(10);
    expect(await db.inventoryMovement.count({ where: { referenceType: "PurchaseOrder", referenceId: order.id } })).toBe(1);
    expect(await db.financialEntry.count({ where: { organizationId, description: `Received purchase ${order.number}` } })).toBe(1);
    const stored = await db.purchaseOrder.findUniqueOrThrow({ where: { id: order.id } });
    expect(stored.status).toBe("RECEIVED");
    expect(stored.receivedAt).not.toBeNull();
  });
});

describe("payroll", () => {
  it("is posted, and its expense booked, once when two postings arrive together", async () => {
    await createSoftwareEmployee({ organizationId, userId: owner(), employeeNumber: `PAY-${suffix}`, name: "Payroll person", roleTitle: "Analyst", salaryMinor: 800_000, hiredAt: new Date("2026-01-01T00:00:00.000Z") });
    const run = await createPayrollRun({ organizationId, userId: owner(), periodStart: new Date("2026-09-01T00:00:00.000Z"), periodEnd: new Date("2026-09-30T00:00:00.000Z") });

    const { succeeded, failures } = await race(3, () => postPayrollRun({ organizationId, payrollRunId: run.id, userId: owner() }));
    expect(succeeded).toHaveLength(1);
    expect(failures).toHaveLength(2);
    for (const failure of failures) expect(failure).toMatch(/already been posted|Draft payroll run not found/);
    expect(await db.financialEntry.count({ where: { organizationId, type: "EXPENSE", description: { startsWith: "Payroll " } } })).toBe(1);
    expect((await db.payrollRun.findUniqueOrThrow({ where: { id: run.id } })).status).toBe("POSTED");
  });
});

describe("amounts that would overflow a 32-bit money column", () => {
  it("are refused with a clear sentence instead of a database error", async () => {
    await expect(createSalesDocument({ organizationId, userId: owner(), kind: "QUOTE", lines: [{ description: "Huge", quantity: 1_000_000, unitPriceMinor: 2_000_000_000 }] })).rejects.toThrow("Sales line total exceeds the supported maximum");
    await expect(createSalesDocument({ organizationId, userId: owner(), kind: "QUOTE", lines: [{ description: "A", quantity: 1, unitPriceMinor: 2_000_000_000, taxRateBps: 0 }, { description: "B", quantity: 1, unitPriceMinor: 2_000_000_000, taxRateBps: 0 }] })).rejects.toThrow("Sales document total exceeds the supported maximum");
    await expect(createPurchaseOrder({ organizationId, userId: owner(), lines: [{ description: "Huge", quantity: 1_000_000, unitCostMinor: 2_000_000_000 }] })).rejects.toThrow("Purchase line total exceeds the supported maximum");
    await expect(createPurchaseOrder({ organizationId, userId: owner(), lines: [{ description: "A", quantity: 1, unitCostMinor: 2_000_000_000 }, { description: "B", quantity: 1, unitCostMinor: 2_000_000_000 }] })).rejects.toThrow("Purchase order total exceeds the supported maximum");

    const second = await createOrganizationForUser({ name: `Atomic payroll org ${suffix}`, userId: ids.owner });
    organizationIds.push(second.id);
    for (const number of ["A", "B"]) {
      await createSoftwareEmployee({ organizationId: second.id, userId: owner(), employeeNumber: `BIG-${number}-${suffix}`, name: `Big salary ${number}`, roleTitle: "Director", salaryMinor: 2_000_000_000, hiredAt: new Date("2026-01-01T00:00:00.000Z") });
    }
    await expect(createPayrollRun({ organizationId: second.id, userId: owner(), periodStart: new Date("2026-09-01T00:00:00.000Z"), periodEnd: new Date("2026-09-30T00:00:00.000Z") })).rejects.toThrow("Payroll gross total exceeds the supported maximum");
  });
});

describe("exam attempts", () => {
  async function exam(title: string, maxAttempts: number | null) {
    if (!academyId) {
      const academy = await db.academy.create({ data: { name: `Atomic academy ${suffix}`, slug: `atomic-academy-${suffix}` } });
      academyId = academy.id;
      const field = await db.academyField.create({ data: { academyId, name: "Business", key: `atomic-business-${suffix}` } });
      const course = await db.academyCourse.create({ data: { academyId, fieldId: field.id, title: "Atomic course", code: `ATOM-${suffix}` } });
      await enrollLearner(course.id, ids.learner);
      courseId = course.id;
    }
    const created = await db.academyExam.create({ data: { courseId, title, assessmentType: "THEORY", passingScore: 80, maxAttempts } });
    const question = await db.academyExamQuestion.create({ data: { examId: created.id, prompt: "Which record proves a controlled operation?", sequence: 1, options: { create: [{ label: "Audited evidence", sequence: 1, isCorrect: true }, { label: "An unsupported claim", sequence: 2 }] } }, include: { options: true } });
    const wrong = question.options.find((option) => !option.isCorrect)!;
    return { examId: created.id, answers: [{ questionId: question.id, optionId: wrong.id }] };
  }

  it("stop at the exam's own limit even when the submissions arrive together", async () => {
    const { examId, answers } = await exam("Limited assessment", 2);
    const { succeeded, failures } = await race(6, () => submitLearnerExamAttempt({ examId, answers, userId: ids.learner }));
    expect(succeeded).toHaveLength(2);
    expect(failures).toEqual(Array(4).fill("Maximum exam attempts reached"));
    expect(await db.learnerExamAttempt.count({ where: { examId, userId: ids.learner } })).toBe(2);
  });

  it("stop at a default of five when the exam sets no limit", async () => {
    expect(DEFAULT_MAX_EXAM_ATTEMPTS).toBe(5);
    const { examId, answers } = await exam("Unlimited-looking assessment", null);
    const { succeeded, failures } = await race(7, () => submitLearnerExamAttempt({ examId, answers, userId: ids.learner }));
    expect(succeeded).toHaveLength(5);
    expect(failures).toEqual(Array(2).fill("Maximum exam attempts reached"));
    expect(await db.learnerExamAttempt.count({ where: { examId, userId: ids.learner } })).toBe(5);
    await expect(submitLearnerExamAttempt({ examId, answers, userId: ids.learner })).rejects.toThrow("Maximum exam attempts reached");
  });

  it("answer with a score and an outcome only, never a right or wrong mark per question", async () => {
    const { examId, answers } = await exam("Feedback assessment", 3);
    const result = await submitLearnerExamAttempt({ examId, answers, userId: ids.learner });
    expect(Object.keys(result.attempt).sort()).toEqual(["createdAt", "examId", "id", "outcome", "score"]);
    expect(result.attempt).toMatchObject({ outcome: "FAILED", score: 0 });
    expect(result).toMatchObject({ attemptsUsed: 1, attemptsRemaining: 2 });
    expect(JSON.stringify(result)).not.toMatch(/correct|isCorrect|selectedOptionId|evidence/i);
    // the record kept for review still has the per-question evidence
    expect((await db.learnerExamAttempt.findUniqueOrThrow({ where: { id: result.attempt.id } })).evidence).not.toBeNull();
  });
});

describe("job applications", () => {
  it("accept one application per person even when two arrive together, and say why the other was refused", async () => {
    const posting = await createJobPosting({
      benefits: "Flexible hybrid schedule, learning budget, and documented growth reviews.",
      city: "Riyadh",
      conditions: "Six years of relevant experience and authorization to work in the selected location.",
      countryCode: "SA",
      department: "Growth",
      description: "Lead AI-enabled market research, build partner pipelines, manage structured experiments, coordinate sales operations, and report measurable revenue impact across business units.",
      requiredSkills: "market research, sales operations, ai, reporting",
      salaryMaxMinor: 3_200_000,
      salaryMinMinor: 2_400_000,
      title: `Atomic role ${suffix}`,
      workMode: "HYBRID",
    }, ids.owner);
    jobIds.push(posting.id);
    await updateJobPostingStatus(posting.id, "PUBLISHED", ids.owner);

    const { succeeded, failures } = await race(3, () => applyToJob(posting.id, "I have market research, sales operations and reporting experience across regional teams.", ids.applicant));
    expect(succeeded).toHaveLength(1);
    expect(failures).toEqual(Array(2).fill("You have already applied to this job posting"));
    expect(await db.jobApplication.count({ where: { jobPostingId: posting.id, applicantId: ids.applicant } })).toBe(1);
  });
});
