import ExcelJS from "exceljs";

import { db } from "@/lib/db";
import { ownedOrganizationRecordWhere } from "@/lib/auth/organization-scope";

export type TalentReportInput = {
  applications: Array<{ candidateName: string; consentVersion: string | null; createdAt: Date; jobTitle: string; matchScore: number; status: string; updatedAt: Date }>;
  generatedAt: Date;
  postings: Array<{ applicantCount: number; city: string | null; countryCode: string | null; createdAt: Date; qualityScore: number; status: string; title: string; updatedAt: Date; workMode: string }>;
};

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF087E8B" } };
}

export async function generateTalentReportWorkbook(input: TalentReportInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Jenan PRO Talent";
  workbook.created = input.generatedAt;
  const terminal = input.applications.filter((application) => application.status === "ACCEPTED" || application.status === "REJECTED");
  const averageMatch = input.applications.length ? Math.round(input.applications.reduce((total, application) => total + application.matchScore, 0) / input.applications.length) : 0;
  const averageDecisionDays = terminal.length ? terminal.reduce((total, application) => total + Math.max(0, application.updatedAt.getTime() - application.createdAt.getTime()), 0) / terminal.length / 86_400_000 : null;

  const summary = workbook.addWorksheet("Summary");
  summary.addRows([["Jenan PRO Hiring Report", input.generatedAt.toISOString()], ["Metric", "Value"], ["Postings", input.postings.length], ["Published roles", input.postings.filter((posting) => posting.status === "PUBLISHED").length], ["Applications", input.applications.length], ["Average match %", averageMatch], ["Average terminal decision days", averageDecisionDays ?? "Unavailable"], [], ["Stage", "Count"], ...["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "REJECTED", "WITHDRAWN"].map((status) => [status, input.applications.filter((application) => application.status === status).length])]);
  styleHeader(summary.getRow(2));
  styleHeader(summary.getRow(9));
  summary.columns = [{ width: 34 }, { width: 24 }];

  const postings = workbook.addWorksheet("Postings", { views: [{ state: "frozen", ySplit: 1 }] });
  postings.addRow(["Title", "Status", "Quality score", "Work mode", "Location", "Applicants", "Created", "Updated"]);
  styleHeader(postings.getRow(1));
  input.postings.forEach((posting) => postings.addRow([posting.title, posting.status, posting.qualityScore, posting.workMode, [posting.city, posting.countryCode].filter(Boolean).join(", "), posting.applicantCount, posting.createdAt.toISOString(), posting.updatedAt.toISOString()]));
  postings.columns = [{ width: 36 }, { width: 18 }, { width: 15 }, { width: 16 }, { width: 24 }, { width: 12 }, { width: 24 }, { width: 24 }];

  const applications = workbook.addWorksheet("Applications", { views: [{ state: "frozen", ySplit: 1 }] });
  applications.addRow(["Candidate", "Posting", "Status", "Match score", "Profile consent", "Submitted", "Updated", "Elapsed days"]);
  styleHeader(applications.getRow(1));
  input.applications.forEach((application) => applications.addRow([application.candidateName, application.jobTitle, application.status, application.matchScore, application.consentVersion ?? "Not shared", application.createdAt.toISOString(), application.updatedAt.toISOString(), Math.round(Math.max(0, application.updatedAt.getTime() - application.createdAt.getTime()) / 86_400_000)]));
  applications.columns = [{ width: 28 }, { width: 36 }, { width: 18 }, { width: 14 }, { width: 20 }, { width: 24 }, { width: 24 }, { width: 14 }];

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function exportTalentReport(userId: string) {
  const [postings, applications] = await Promise.all([
    db.jobPosting.findMany({ where: ownedOrganizationRecordWhere(userId), select: { title: true, status: true, qualityScore: true, workMode: true, city: true, countryCode: true, createdAt: true, updatedAt: true, _count: { select: { applications: true } } }, orderBy: { updatedAt: "desc" } }),
    db.jobApplication.findMany({ where: { jobPosting: ownedOrganizationRecordWhere(userId) }, select: { status: true, matchScore: true, consentVersion: true, createdAt: true, updatedAt: true, jobPosting: { select: { title: true } }, applicant: { select: { profile: { select: { displayName: true } } } } }, orderBy: { updatedAt: "desc" } }),
  ]);
  const generatedAt = new Date();
  const bytes = await generateTalentReportWorkbook({ generatedAt, postings: postings.map(({ _count, ...posting }) => ({ ...posting, applicantCount: _count.applications })), applications: applications.map((application) => ({ candidateName: application.applicant.profile?.displayName ?? "Candidate", consentVersion: application.consentVersion, createdAt: application.createdAt, jobTitle: application.jobPosting.title, matchScore: application.matchScore, status: application.status, updatedAt: application.updatedAt })) });
  await db.auditLog.create({ data: { actorId: userId, action: "talent.report.exported", entityType: "TalentReport", metadata: { applicationCount: applications.length, format: "XLSX", postingCount: postings.length } } });
  return { bytes, generatedAt };
}