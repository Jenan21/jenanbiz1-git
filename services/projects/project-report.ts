import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { getUserProject } from "@/services/projects/project-service";
import { assessProjectReadiness } from "@/services/projects/project-readiness";
import type { ProjectIntelligenceResult } from "@/services/projects/project-intelligence";
import type { FeasibilityResult } from "@/services/projects/project-calculations";

let fontsReady = false;
function registerReportFonts() {
  if (fontsReady) return;
  for (const subset of ["latin", "arabic"]) {
    const file = path.join(process.cwd(), "node_modules", "@fontsource-variable", "alexandria", "files", `alexandria-${subset}-wght-normal.woff2`);
    if (!GlobalFonts.registerFromPath(file, "JenanReport")) throw new Error("Report font unavailable");
  }
  fontsReady = true;
}

function value(input: unknown): string {
  if (input === null || input === undefined || input === "") return "Unavailable";
  if (typeof input === "number") return Number.isFinite(input) ? input.toLocaleString("en-US", { maximumFractionDigits: 4 }) : "Unavailable";
  return String(input);
}

export async function createProjectReport(projectId: string, userId: string, intelligence?: ProjectIntelligenceResult) {
  const project = await getUserProject(projectId, userId);
  if (!project) throw new Error("Project not found");
  return renderProjectReport(buildProjectReportRows(project, intelligence), project.name);
}

type ProjectReportRecord = NonNullable<Awaited<ReturnType<typeof getUserProject>>>;

export function buildProjectReportRows(project: ProjectReportRecord, intelligence?: ProjectIntelligenceResult) {
  const readiness = assessProjectReadiness(project);
  const savedIntelligence = project.intelligenceSnapshots[0] as unknown as ProjectIntelligenceResult | undefined;
  const reportIntelligence = intelligence ?? savedIntelligence;
  const plan = project.financialPlans[0];
  const financial = plan?.baseCase as unknown as Partial<FeasibilityResult> | undefined;
  const rows: Array<{ text: string; heading?: boolean }> = [];
  const add = (text: string, heading = false) => rows.push({ text, heading });
  add("JENAN PRO — PROJECT REVIEW REPORT", true);
  add(`Generated: ${new Date().toISOString()} | Project ID: ${project.id}`);
  add("Source: user-recorded platform data. Not independently verified, not an investment guarantee or certified valuation.");
  add(`Project: ${project.name}`, true);
  add(`Record created: ${project.createdAt.toISOString()} | Last updated: ${project.updatedAt.toISOString()}`);
  for (const [label, item] of [
    ["Organization", project.organization?.name], ["Sector", project.sector], ["Country", project.countryCode],
    ["Currency", project.currency], ["Status", project.status], ["Phase", project.currentPhase], ["Description", project.description],
  ]) add(`${label}: ${value(item)}`);
  add("Evidence quality and review checklist", true);
  add(`Weighted score: ${readiness.quality.score}/100 | Completeness: ${readiness.quality.completeness}% | Rule-based verdict: ${readiness.quality.verdict}`);
  add(`Missing evidence: ${readiness.quality.missing.join(", ") || "None"} | Launch blockers: ${readiness.blockers.join(", ") || "None"}`);
  add(`Pending compliance: ${readiness.pendingCompliance} | Overdue risk reviews: ${readiness.overdueRiskReviews}`);
  add(`Market research snapshot: ${readiness.marketResearch.freshness} | Age: ${value(readiness.marketResearch.ageDays)} days | Retrieved: ${value(readiness.marketResearch.fetchedAt)}. Snapshot age is advisory and does not guarantee that underlying source data is current.`);
  add(`Checksummed evidence files: ${readiness.checksummedFiles}/${readiness.evidenceFiles}. Checksums prove file integrity, not truthfulness.`);
  for (const assessment of project.assessments) {
    add(`${assessment.type}: ${value(assessment.score)}/100 | Recorded: ${assessment.assessedAt?.toISOString() ?? "Unavailable"}`);
    add(`Evidence: ${value(assessment.summary)} | Source claim: ${value(assessment.source)}`);
    if (assessment.evidenceFiles.length) {
      for (const evidence of assessment.evidenceFiles) {
        const file = evidence.fileAsset;
        add(`Linked evidence: ${file.fileName} | Type: ${file.mimeType} | Uploaded: ${file.createdAt.toISOString()} | Linked: ${evidence.createdAt.toISOString()} | SHA-256: ${value(file.checksum)}`);
      }
    } else {
      add("Linked evidence files: None. The recorded source claim has not been independently verified.");
    }
  }
  add("Deterministic financial study", true);
  add(`Saved plan: ${plan ? `v${plan.version} | ${plan.createdAt.toISOString()}` : "Unavailable"} | Model: ${value(financial?.modelVersion)}`);
  if (plan && financial?.modelVersion === "JENAN_FINANCE_V2") {
    for (const [field, input] of Object.entries(plan.inputs as Record<string, unknown>)) add(`Input ${field}: ${value(input)}`);
    for (const field of ["monthlyRevenue", "monthlyProfit", "totalProfit", "breakEvenUnits", "roiPercent", "netPresentValue", "internalRateReturn", "paybackMonths", "discountedPaybackMonths", "marginOfSafetyPercent"] as const) add(`${field}: ${value(financial[field])}`);
    add("Method: effective annual rates converted to monthly; month-end operating cash flows; initial investment at month zero.");
    for (const assumption of financial.assumptions ?? []) add(`Limitation: ${assumption}`);
    add("Cash-flow reconciliation (annual blocks of the saved monthly schedule)", true);
    const flows = financial.cashFlows ?? [];
    for (let start = 1; start < flows.length; start += 12) {
      const block = flows.slice(start, start + 12);
      add(`Months ${start}–${start + block.length - 1}: revenue ${value(block.reduce((sum, flow) => sum + flow.revenue, 0))}; costs ${value(block.reduce((sum, flow) => sum + flow.costs, 0))}; tax ${value(block.reduce((sum, flow) => sum + flow.tax, 0))}; net ${value(block.reduce((sum, flow) => sum + flow.netCashFlow, 0))}; cumulative ${value(block.at(-1)?.cumulativeCashFlow)}`);
    }
    add("Assumed scenarios — not probabilities or market forecasts", true);
    for (const scenario of plan.scenarios as Array<Record<string, unknown>>) add(`${scenario.scenario}: monthly profit ${value(scenario.monthlyProfit)} | NPV ${value(scenario.netPresentValue)} | ROI ${value(scenario.roiPercent)}`);
    const sensitivity = (plan.baseCase as Record<string, unknown>).sensitivity as Array<Record<string, unknown>> | undefined;
    if (sensitivity?.length) {
      add("One-factor sensitivity — other inputs held constant", true);
      for (const item of sensitivity) add(`${item.driver} ${value(item.changePercent)}%: NPV ${value(item.netPresentValue)} | change ${value(item.npvDelta)}`);
    }
  } else if (plan) add("Legacy or unsupported financial model. Recalculate from reviewed inputs to produce the current reproducible study.");
  add("Governance and delivery", true);
  add(`Recorded decision: ${value(project.decisions[0]?.verdict)} | Matches current evidence: ${readiness.decisionCurrent ? "Yes" : "No — review required"}`);
  add(`Decision rationale: ${value(project.decisions[0]?.rationale)}`);
  for (const phase of project.phases) add(`${phase.sequence}. ${phase.title}: ${phase.status} | Notes: ${value(phase.notes)}`);
  for (const item of project.complianceItems) add(`Compliance ${item.title}: ${item.status} | Authority: ${value(item.authority)}`);
  for (const risk of project.risks) {
    add(`Risk ${risk.title}: ${risk.status} | ${risk.score}/25 | Owner: ${risk.ownerLabel} | Review: ${risk.reviewAt?.toISOString() ?? "Unavailable"}`);
    add(`Mitigation: ${risk.mitigation}`);
  }
  for (const file of project.evidenceFiles) add(`Project evidence file: ${file.fileName} | Type: ${file.mimeType} | Uploaded: ${file.createdAt.toISOString()} | SHA-256: ${value(file.checksum)}`);
  add("External intelligence and limitations", true);
  if (reportIntelligence) {
    add(`Location: ${value(reportIntelligence.location?.label)} | Population: ${value(reportIntelligence.population.value)} (${value(reportIntelligence.population.year)}) | Purchasing power: ${value(reportIntelligence.purchasingPower.value)} (${value(reportIntelligence.purchasingPower.year)}) | Cost inflation: ${value(reportIntelligence.costInflation.value)} (${value(reportIntelligence.costInflation.year)})`);
    add(`Nearby mapped businesses: ${reportIntelligence.competitors.length}. These listings are not independently verified competitors or a complete market census.`);
    for (const source of reportIntelligence.sources) add(`Source: ${source.source} | Retrieved: ${value(source.fetchedAt)} | URL: ${source.url} | Confidence: ${source.confidence}`);
    for (const limitation of reportIntelligence.limitations) add(`Limitation: ${limitation}`);
  } else add("No external intelligence snapshot is available. No population, demand, competitors or market valuation are invented.");
  add("Review recommendation: validate source claims, costs, demand, licenses, taxes and assumptions with qualified domain reviewers before acting.");
  add("PDF uses shaped Unicode image pages to preserve Arabic and mixed-language text; text selection/search is not supported.");
  return rows;
}

export async function renderProjectReport(rows: Array<{ text: string; heading?: boolean }>, title: string) {
  registerReportFonts();
  const pdf = await PDFDocument.create();
  pdf.setTitle(title);
  pdf.setAuthor("Jenan PRO");
  pdf.setSubject("User-recorded evidence and deterministic calculations; independent verification required");
  const logoBytes = await readFile(path.join(process.cwd(), "public", "assets", "jenan-pro-logo.jpg"));
  const logo = await pdf.embedJpg(logoBytes);
  const canvas = createCanvas(1190, 1684);
  const context = canvas.getContext("2d");
  let y = 80;
  const reset = () => {
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#102a43";
    y = 90;
  };
  const flush = async () => {
    const page = pdf.addPage([595, 842]);
    page.drawImage(await pdf.embedPng(canvas.toBuffer("image/png")), { x: 0, y: 0, width: 595, height: 842 });
    page.drawImage(logo, { x: 42, y: 12, width: 26, height: 25 });
  };
  reset();
  for (const row of rows) {
    context.font = `${row.heading ? 28 : 22}px "JenanReport"`;
    const lines: string[] = [];
    let line = "";
    for (const word of row.text.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (context.measureText(candidate).width <= 1000) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of word) {
        if (line && context.measureText(line + character).width > 1000) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
    for (const text of lines) {
      if (y > 1550) { await flush(); reset(); }
      const rtl = /[\u0600-\u06ff]/.test(text);
      context.direction = rtl ? "rtl" : "ltr";
      context.textAlign = rtl ? "right" : "left";
      context.fillStyle = row.heading ? "#006181" : "#102a43";
      context.fillText(text, rtl ? 1090 : 84, y);
      y += row.heading ? 44 : 34;
    }
    y += 12;
  }
  await flush();
  return pdf.save();
}
