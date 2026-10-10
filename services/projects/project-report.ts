import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { getUserProject } from "@/services/projects/project-service";
import { assessProjectQuality } from "@/services/projects/project-quality";
import type { ProjectIntelligenceResult } from "@/services/projects/project-intelligence";

function formatValue(value: string | number | null | undefined) {
  return value === null || value === undefined || value === "" ? "-" : String(value);
}

function jsonRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function jsonText(value: unknown) {
  if (Array.isArray(value)) return value.map(String).join(", ");
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : "-";
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
  const logoPath = path.join(process.cwd(), "public", "assets", "jenan-pro-logo.jpg");
  const logo = await pdf.embedJpg(await readFile(logoPath));
  let page = pdf.addPage([595, 842]);
  let y = 790;
  const margin = 42;
  const contentWidth = 511;
  const addText = (value: string, size = 11, isBold = false) => {
    const activeFont = isBold ? bold : font;
    const words = value.split(/\s+/).filter(Boolean);
    const lines: string[] = [];
    let line = "";
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (line && activeFont.widthOfTextAtSize(next, size) > contentWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    if (line || !lines.length) lines.push(line || "-");
    for (const text of lines) {
      if (y < 55) {
        page = pdf.addPage([595, 842]);
        y = 790;
      }
      page.drawText(text, { x: margin, y, size, font: activeFont, color: rgb(0.05, 0.13, 0.25) });
      y -= size + 9;
    }
  };
  const addKeyValueTable = (rows: Array<[string, string]>) => {
    for (const [label, value] of rows) {
      if (y < 55) {
        page = pdf.addPage([595, 842]);
        y = 790;
      }
      page.drawRectangle({ x: margin, y: y - 7, width: contentWidth, height: 25, color: rgb(0.96, 0.98, 1) });
      page.drawText(label, { x: margin + 8, y, size: 10, font: bold, color: rgb(0.05, 0.13, 0.25) });
      page.drawText(value.slice(0, 56), { x: margin + 175, y, size: 10, font, color: rgb(0.16, 0.24, 0.34) });
      y -= 29;
    }
  };

  page.drawImage(logo, { x: margin, y: 700, width: 86, height: 82 });
  page.drawText("JENAN PRO PROJECT REPORT", { x: 150, y: 760, size: 18, font: bold, color: rgb(0, 0.38, 0.65) });
  page.drawText("Generated from verified platform records", { x: 150, y: 738, size: 10, font, color: rgb(0.32, 0.4, 0.5) });
  y = 675;
  addText(`Project: ${formatValue(project.name)}`, 16, true);
  addKeyValueTable([
    ["Organization", formatValue(project.organization?.name)],
    ["Project owner", formatValue(project.createdBy.profile?.displayName ?? project.createdBy.email)],
    ["Sector", formatValue(project.sector)],
    ["Country", formatValue(project.countryCode)],
    ["Currency", formatValue(project.currency)],
    ["Status", formatValue(project.status)],
    ["Current phase", formatValue(project.currentPhase)],
  ]);
  addText(`Description: ${formatValue(project.description)}`);
  const feasibilityStudy = jsonRecord(project.feasibilityStudy);
  const feasibilitySections = jsonRecord(feasibilityStudy?.sections);
  if (feasibilitySections) {
    const sectionNames = ["GENERAL", "MARKET", "MARKETING", "TECHNICAL", "FINANCIAL", "SWOT", "TIMELINE"];
    const completedSections = sectionNames.filter((section) => jsonRecord(feasibilitySections[section]));
    const general = jsonRecord(feasibilitySections.GENERAL);
    const market = jsonRecord(feasibilitySections.MARKET);
    const marketing = jsonRecord(feasibilitySections.MARKETING);
    const technical = jsonRecord(feasibilitySections.TECHNICAL);
    const swot = jsonRecord(feasibilitySections.SWOT);
    const timeline = jsonRecord(feasibilitySections.TIMELINE);
    y -= 10;
    addText("Professional feasibility study", 14, true);
    addText(`Study completion: ${completedSections.length}/${sectionNames.length} sections`);
    addKeyValueTable([
      ["Project type", jsonText(general?.projectType)],
      ["Legal nature", jsonText(general?.legalNature)],
      ["Project size", jsonText(general?.size)],
      ["Study location", jsonText(general?.location)],
      ["Market scope", jsonText(market?.scope)],
      ["Marketing strategy", jsonText(marketing?.strategy)],
      ["Marketing budget", jsonText(marketing?.budget)],
      ["Facility type", jsonText(technical?.facilityType)],
      ["Facility area", jsonText(technical?.facilityArea)],
      ["Equipment count", jsonText(technical?.equipmentCount)],
    ]);
    addText(`Customer segment: ${jsonText(market?.customerSegment)}`);
    addText(`Market size and sources: ${jsonText(market?.marketSizeNotes)}`);
    addText(`Competitor assessment: ${jsonText(market?.competitorNotes)}`);
    addText(`Marketing objectives: ${jsonText(marketing?.objectives)}`);
    addText(`Marketing channels: ${jsonText(marketing?.channels)}`);
    addText(`Products and services: ${jsonText(technical?.productsServices)}`);
    addText(`Workforce plan: ${jsonText(technical?.staffingPlan)}`);
    addText(`SWOT recommendation: ${jsonText(swot?.recommendation)}`);
    addText(`Delivery start: ${jsonText(timeline?.startDate)}`);
    addText(`Delivery duration: ${jsonText(timeline?.durationMonths)} months`);
    addText(`Key milestones: ${jsonText(timeline?.milestones)}`);
  }
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
  addText("Governance", 14, true);
  const decision = project.decisions[0];
  const financialPlan = project.financialPlans[0];
  addText(`Recorded decision: ${formatValue(decision?.verdict)}`);
  addText(`Decision score: ${formatValue(decision?.weightedScore)}/100`);
  addText(`Decision rationale: ${formatValue(decision?.rationale)}`);
  addText(`Financial plan version: ${financialPlan ? `v${financialPlan.version}` : "-"}`);
  if (financialPlan) {
    const baseCase = jsonRecord(financialPlan.baseCase);
    addKeyValueTable([
      ["Monthly revenue", jsonText(baseCase?.monthlyRevenue)],
      ["Monthly profit", jsonText(baseCase?.monthlyProfit)],
      ["Break-even units", jsonText(baseCase?.breakEvenUnits)],
      ["ROI percent", jsonText(baseCase?.roiPercent)],
      ["Payback months", jsonText(baseCase?.paybackMonths)],
      ["Net present value", jsonText(baseCase?.netPresentValue)],
      ["Internal rate of return", jsonText(baseCase?.internalRateReturn)],
    ]);
  }
  if (project.risks.length) {
    addText("Risk register", 14, true);
    for (const risk of project.risks) {
      addText(`${risk.title} | ${risk.status} | score ${risk.score}/25 | owner: ${risk.ownerLabel}`);
      addText(`Mitigation: ${risk.mitigation}`);
    }
  }
  if (project.evidenceFiles.length) {
    addText("Evidence files", 14, true);
    for (const file of project.evidenceFiles) {
      addText(`${file.fileName} | ${file.mimeType} | checksum: ${formatValue(file.checksum)}`);
    }
  }
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
