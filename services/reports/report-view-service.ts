import { db } from "@/lib/db";
import type { ReportRoute } from "@/lib/reports/report-routes";
import { assessProjectQuality } from "@/services/projects/project-quality";
import { getUserProject, projectAccessWhere } from "@/services/projects/project-service";
import { assessProjectReadiness } from "@/services/projects/project-readiness";

export type ReportRow = { label: string; value: string };
export type ReportSection = { title: string; note?: string; rows: ReportRow[] };

async function resolveProject(userId: string, projectId?: string) {
  if (projectId) return getUserProject(projectId, userId);
  const first = await db.project.findFirst({
    where: projectAccessWhere(userId),
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });
  return first ? getUserProject(first.id, userId) : null;
}

function projectSections(project: NonNullable<Awaited<ReturnType<typeof resolveProject>>>, mode: "analysis" | "evaluation") {
  const quality = assessProjectQuality(project.assessments);
  const readiness = assessProjectReadiness(project);
  const sections: ReportSection[] = [
    {
      title: "بيانات المشروع",
      rows: [
        { label: "الاسم", value: project.name },
        { label: "المنظمة", value: project.organization?.name ?? "غير مرتبط" },
        { label: "القطاع", value: project.sector ?? "غير متاح" },
        { label: "الدولة", value: project.countryCode ?? "غير متاح" },
        { label: "الحالة", value: project.status },
        { label: "المرحلة", value: project.currentPhase },
      ],
    },
    {
      title: "جودة السجل",
      note: "أدلة يسجلها المستخدم؛ ليست تحققاً مستقلاً أو ضماناً للاستثمار.",
      rows: [
        { label: "الدرجة الموزونة", value: `${quality.score}/100` },
        { label: "اكتمال الأدلة", value: `${quality.completeness}%` },
        { label: "جاهزية القرار", value: quality.readyForDecision ? "جاهز" : "أدلة غير مكتملة" },
      ],
    },
    {
      title: "فحص الجاهزية والمراجعة",
      rows: [
        { label: "مطابقة الاعتماد للأدلة", value: readiness.decisionCurrent ? "مطابق" : "يتطلب مراجعة" },
        { label: "مخاطر عالية مفتوحة", value: String(readiness.highOpenRisks) },
        { label: "مراجعات مخاطر متأخرة", value: String(readiness.overdueRiskReviews) },
        { label: "امتثال يحتاج متابعة", value: String(readiness.pendingCompliance) },
        { label: "الأدلة الناقصة", value: quality.missing.join("، ") || "لا يوجد" },
      ],
    },
  ];
  const financialPlan = project.financialPlans[0];
  const base = financialPlan?.baseCase as Record<string, unknown> | undefined;
  const format = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString("ar-SA", { maximumFractionDigits: 2 }) : "غير متاح";
  if (financialPlan) sections.push({
    title: "الدراسة المالية المحفوظة",
    note: `نسخة ${financialPlan.version} · ${financialPlan.createdAt.toISOString()} · ${base?.modelVersion ?? "نموذج سابق"} · حسابات من افتراضات المستخدم، وليست توقعات سوقية مستقلة.`,
    rows: [
      { label: "صافي القيمة الحالية NPV", value: format(base?.netPresentValue) },
      { label: "العائد على الاستثمار %", value: format(base?.roiPercent) },
      { label: "العائد الداخلي السنوي %", value: format(base?.internalRateReturn) },
      { label: "استرداد الاستثمار (شهر)", value: format(base?.paybackMonths) },
      { label: "الاسترداد المخصوم (شهر)", value: format(base?.discountedPaybackMonths) },
      { label: "نقطة التعادل (وحدة)", value: format(base?.breakEvenUnits) },
    ],
  });
  if (mode === "analysis") {
    sections.push({
      title: "مصادر التحليل",
      note: project.intelligenceSnapshots.length ? undefined : "بانتظار مصدر معلومات سوقية معتمد.",
      rows: project.intelligenceSnapshots.map((snapshot, index) => ({ label: `نسخة ${index + 1}`, value: `${snapshot.query} · ${snapshot.fetchedAt.toISOString()}` })),
    });
  } else {
    sections.push(
      { title: "التقييمات", rows: project.assessments.map((item) => ({ label: item.type, value: `${item.score ?? "—"}/100 · ${item.source ?? "مصدر غير محدد"}` })) },
      { title: "المخاطر", rows: project.risks.map((item) => ({ label: item.title, value: `${item.status} · ${item.score}/25` })) },
    );
  }
  return sections;
}

export async function getReportView(input: { path: ReportRoute; projectId?: string; userId: string }) {
  const generatedAt = new Date();
  if (input.path === "/reports/view/portfolio" || input.path === "/reports/view/investment") {
    return {
      title: input.path.endsWith("portfolio") ? "تقرير المحفظة الاستثمارية" : "تقرير الاستثمار",
      subtitle: "صفحة تقرير جاهزة لاستقبال سجل استثماري من مصدر معتمد.",
      sourceState: "AWAITING_APPROVED_SOURCE" as const,
      source: null,
      generatedAt,
      projectId: null,
      sections: [{ title: "حالة المصدر", note: "بانتظار مصدر معتمد. لا تعرض المنصة قيماً أو عوائد تقديرية دون سجل موثق.", rows: [] }],
    };
  }

  const project = await resolveProject(input.userId, input.projectId);
  if (!project) {
    return {
      title: input.path === "/reports/print/project-analysis" ? "تقرير تحليل المشروع" : input.path === "/reports/print/project-evaluation" ? "تقرير تقييم المشروع" : "عارض التقارير",
      subtitle: "لا يوجد مشروع متاح لهذا الحساب بعد.",
      sourceState: "EMPTY" as const,
      source: "PROJECT_RECORDS",
      generatedAt,
      projectId: null,
      sections: [] as ReportSection[],
    };
  }

  const mode = input.path === "/reports/print/project-evaluation" ? "evaluation" : "analysis";
  return {
    title: input.path === "/reports/view/general" ? `تقرير ${project.name}` : mode === "analysis" ? "تقرير تحليل المشروع" : "تقرير تقييم المشروع",
    subtitle: project.description ?? "تقرير مولد من سجلات المشروع الفعلية.",
    sourceState: "LIVE" as const,
    source: "PROJECT_RECORDS",
    generatedAt,
    projectId: project.id,
    sections: projectSections(project, mode),
  };
}