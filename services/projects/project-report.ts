import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getUserProject } from "@/services/projects/project-service";
import { assessProjectQuality } from "@/services/projects/project-quality";
import type { ProjectIntelligenceResult } from "@/services/projects/project-intelligence";

function formatValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

export async function createProjectReport(projectId: string, userId: string, intelligence?: ProjectIntelligenceResult) {
  const project = await getUserProject(projectId, userId);
  if (!project) throw new Error("Project not found");

  const quality = assessProjectQuality(project.assessments);
  const savedIntelligence = project.intelligenceSnapshots[0]
    ? (project.intelligenceSnapshots[0] as unknown as ProjectIntelligenceResult)
    : undefined;
  const reportIntelligence = intelligence ?? savedIntelligence;
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const logoPath = path.join(process.cwd(), "public", "assets", "jenan-biz-logo.png");
  const logo = await pdf.embedPng(await readFile(logoPath));
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const margin = 42;
  const addText = (value: string, size = 11, isBold = false) => {
    if (y < 55) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }
    page.drawText(value.slice(0, 105), { x: margin, y, size, font: isBold ? bold : font, color: rgb(0.05, 0.13, 0.25) });
    y -= size + 9;
  };

  page.drawImage(logo, { x: margin, y: 700, width: 86, height: 82 });
  page.drawText("JENAN BIZ PROJECT REPORT", { x: 150, y: 760, size: 18, font: bold, color: rgb(0, 0.38, 0.65) });
  page.drawText("Generated from verified platform records", { x: 150, y: 738, size: 10, font, color: rgb(0.32, 0.4, 0.5) });
  y = 675;
  addText(`Project: ${formatValue(project.name)}`, 16, true);
  addText(`Organization: ${formatValue(project.organization?.name)}`);
  addText(`Project owner: ${formatValue(project.createdBy.profile?.displayName ?? project.createdBy.email)}`);
  addText(`Sector: ${formatValue(project.sector)}`);
  addText(`Country: ${formatValue(project.countryCode)}`);
  addText(`Currency: ${formatValue(project.currency)}`);
  addText(`Status: ${formatValue(project.status)}`);
  addText(`Current phase: ${formatValue(project.currentPhase)}`);
  addText(`Description: ${formatValue(project.description)}`);
  y -= 10;
  addText("Project lifecycle", 14, true);
  for (const phase of project.phases) addText(`${phase.sequence}. ${phase.title} - ${phase.status}`);
  y -= 10;
  addText("Assessment quality", 14, true);
  addText(`Weighted score: ${quality.score}/100`);
  addText(`Evidence completeness: ${quality.completeness}%`);
  addText(`Decision readiness: ${quality.readyForDecision ? "Ready" : "Incomplete evidence"}`);
  for (const assessment of project.assessments) addText(`${assessment.type}: ${formatValue(assessment.score)}/100 | ${formatValue(assessment.source)}`);
  y -= 10;
  addText("Data integrity note", 14, true);
  if (reportIntelligence) {
    addText(`Location intelligence: ${formatValue(reportIntelligence.location?.label)}`);
    addText(`Population: ${formatValue(reportIntelligence.population.value)} (${formatValue(reportIntelligence.population.year)})`);
    addText(`Purchasing power: ${formatValue(reportIntelligence.purchasingPower.value)} (${formatValue(reportIntelligence.purchasingPower.year)})`);
    addText(`Discovered competitors: ${reportIntelligence.competitors.length}`);
    for (const source of reportIntelligence.sources) addText(`Source: ${source.source} | confidence: ${source.confidence}`);
    for (const limitation of reportIntelligence.limitations) addText(`Limitation: ${limitation}`);
  } else {
    addText("External population, purchasing power, competitor, and map intelligence were not requested for this report.");
  }
  addText("This report contains platform records and deterministic assessment outputs only.");
  return await pdf.save();
}
