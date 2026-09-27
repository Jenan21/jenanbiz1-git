import Link from "next/link";

import type { AdminOperationRoute } from "@/lib/admin/admin-operations-routes";
import type { AdminPanel } from "@/services/admin/admin-operations-service";
import { AdminOperationActions } from "@/components/admin/admin-operation-actions";
import { MissionEngineActions } from "@/components/admin/mission-engine-actions";
import { KnowledgeActions } from "@/components/admin/knowledge-actions";
import { ModelToolActions } from "@/components/admin/model-tool-actions";
import { ObservabilityActions } from "@/components/admin/observability-actions";

type Snapshot = {
  definition: AdminOperationRoute;
  panels: AdminPanel[];
  metrics: { panels: number; livePanels: number; records: number; unavailablePanels: number };
  generatedAt: string;
};

const groupLinks = [
  ["/admin", "الإدارة"], ["/robots/factory", "المصنع"], ["/robot-academy", "الأكاديمية"],
  ["/robot-org", "الهيكل"], ["/missions", "المهام"], ["/intelligence", "الذكاء"],
  ["/models", "النماذج"], ["/tools", "الأدوات"], ["/finance", "المالية"],
  ["/observability", "المراقبة"], ["/admin/reports", "التقارير"],
] as const;

const panelAliases: Record<string, string[]> = {
  "/admin/subscriptions": ["subscriptions", "plans"],
  "/admin/services": ["services"],
  "/admin/rbac": ["rbac"],
  "/admin/audit": ["audit"],
  "/robots/factory/create-batch": ["batches"],
  "/robots/factory/batches": ["batches"],
  "/robots/factory/batches/sample": ["batches"],
  "/robots/factory/genetics": ["genetics"],
  "/robots/registry": ["robots"],
  "/robots/profile/sample": ["profiles"],
  "/robot-academy/batches": ["batches", "profiles"],
  "/robot-academy/batches/sample": ["batches", "queue-items"],
  "/robot-academy/curriculum": ["programs"],
  "/robot-academy/theory": ["courses"],
  "/robot-academy/practical": ["sandbox", "queues"],
  "/robot-academy/exams": ["exams"],
  "/robot-academy/exams/sample": ["exams"],
  "/robot-academy/results/sample": ["profiles"],
  "/robot-academy/graduation": ["profiles"],
  "/robot-academy/elimination": ["profiles", "queue-items"],
  "/robot-academy/specializations": ["programs"],
  "/robot-academy/geography": ["geography"],
  "/robot-org/workers": ["organization"],
  "/robot-org/supervisors": ["organization"],
  "/robot-org/managers": ["organization"],
  "/robot-org/supreme-committee": ["committee"],
  "/robot-org/supreme-committee/review/sample": ["committee"],
  "/robot-org/escalations": ["escalations"],
  "/missions/create": ["missions"],
  "/missions/queue": ["tasks"],
  "/missions/sample": ["missions", "tasks"],
  "/missions/sample/dependencies": ["dependencies"],
  "/missions/sample/retry-fallback": ["retry"],
  "/missions/sample/approvals": ["approvals"],
  "/missions/sample/evidence": ["evidence"],
  "/missions/sample/cost": ["costs"],
  "/intelligence/knowledge": ["knowledge"],
  "/intelligence/experiences": ["experiences"],
  "/intelligence/learning-logs": ["learning"],
  "/intelligence/evidence": ["evidence"],
  "/intelligence/reviews": ["reviews"],
  "/intelligence/versions": ["versions"],
  "/intelligence/skills": ["skills"],
  "/models/router": ["router"],
  "/models/executions": ["model-executions"],
  "/tools/permissions": ["tool-permissions"],
  "/tools/executions": ["tool-executions"],
  "/finance/revenue": ["revenue"],
  "/finance/costs": ["costs"],
  "/finance/ai-costs": ["costs"],
  "/finance/service-profitability": ["financial-entries"],
  "/finance/ledger": ["financial-entries", "costs"],
  "/observability/workers": ["workers"],
  "/observability/queues": ["queues", "jobs"],
  "/observability/health": ["health"],
  "/observability/logs": ["logs"],
  "/observability/alerts": ["alerts"],
  "/observability/backups": ["backups"],
};

const groupRoots = new Set(["/robots/factory", "/robot-academy", "/robot-org", "/missions", "/intelligence", "/models", "/tools", "/finance", "/observability"]);

function formatValue(value: string | number | boolean | null) {
  if (value === null || value === "") return "غير متاح";
  if (typeof value === "boolean") return value ? "نعم" : "لا";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value)) return new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  return String(value);
}

function DataPanel({ panel }: { panel: AdminPanel }) {
  const columns = panel.rows[0] ? Object.keys(panel.rows[0]) : [];
  return (
    <section className="admin-ops-panel" data-source-state={panel.sourceState.toLowerCase()}>
      <header>
        <div><span className="admin-ops-source">{panel.sourceState}</span><h2>{panel.title}</h2></div>
        <strong>{panel.rows.length.toLocaleString("ar-SA")} سجل</strong>
      </header>
      {panel.note ? <p className="admin-ops-note">{panel.note}</p> : null}
      {panel.rows.length ? (
        <div className="admin-ops-table-wrap">
          <table className="admin-ops-table">
            <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
            <tbody>{panel.rows.map((row, index) => <tr key={String(row.id ?? index)}>{columns.map((column) => <td key={column} title={formatValue(row[column])}>{formatValue(row[column])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <div className="admin-ops-empty"><strong>لا توجد بيانات متاحة</strong><span>{panel.sourceState === "UNAVAILABLE" ? "المصدر غير موصول حالياً." : "المصدر موصول ولا توجد سجلات بعد."}</span></div>}
    </section>
  );
}

export function AdminOperationPage({ snapshot }: { snapshot: Snapshot }) {
  const { definition, metrics } = snapshot;
  const keys = panelAliases[definition.path];
  const selectedPanels = keys ? snapshot.panels.filter((item) => keys.includes(item.key)) : groupRoots.has(definition.path) || definition.group === "reports" ? snapshot.panels : snapshot.panels.slice(0, 3);
  const sourceState = metrics.unavailablePanels === metrics.panels ? "UNAVAILABLE" : metrics.livePanels === metrics.panels ? "LIVE" : "MIXED";
  const informationRequests = snapshot.panels.find((item) => item.key === "information-requests")?.rows
    .map((item) => ({ id: String(item.id), label: `${String(item.robot)} · ${String(item.requester)}`, status: String(item.status) })) ?? [];

  return (
    <main className="admin-ops" data-admin-access="ADMIN" data-admin-group={definition.group} data-admin-kind={definition.kind} data-admin-operation={definition.path} data-admin-source={sourceState}>
      <nav className="admin-ops-switcher" aria-label="أقسام منصة الإدارة">
        {groupLinks.map(([href, label]) => <Link key={href} href={href} className={definition.path === href || (href !== "/admin" && definition.path.startsWith(`${href}/`)) ? "active" : ""}>{label}</Link>)}
      </nav>

      <header className="admin-ops-hero">
        <div><span>JENAN PRO · {definition.kind.toUpperCase()}</span><h1>{definition.title}</h1><p>بيانات تشغيلية مباشرة من مصادر المنصة، مع حالة واضحة لكل مصدر ودون قيم تجريبية.</p></div>
        <div className="admin-ops-freshness"><span>آخر تحديث</span><strong>{new Intl.DateTimeFormat("ar-SA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(snapshot.generatedAt))}</strong></div>
      </header>

      <section className="admin-ops-metrics" aria-label="ملخص المصادر">
        <article><span>السجلات</span><strong>{metrics.records.toLocaleString("ar-SA")}</strong></article>
        <article><span>المصادر المباشرة</span><strong>{metrics.livePanels}/{metrics.panels}</strong></article>
        <article><span>غير الموصول</span><strong>{metrics.unavailablePanels.toLocaleString("ar-SA")}</strong></article>
        <article><span>حالة الوصول</span><strong>ADMIN</strong></article>
      </section>

      <AdminOperationActions path={definition.path} informationRequests={informationRequests} />
      {definition.group === "missions" ? <MissionEngineActions approvals={snapshot.panels.find((item) => item.key === "approvals")?.rows ?? []} missions={snapshot.panels.find((item) => item.key === "missions")?.rows ?? []} robots={snapshot.panels.find((item) => item.key === "mission-robots")?.rows ?? []} runs={snapshot.panels.find((item) => item.key === "runs")?.rows ?? []} subtasks={snapshot.panels.find((item) => item.key === "tasks")?.rows ?? []} /> : null}
      {definition.group === "intelligence" ? <KnowledgeActions entries={snapshot.panels.find((item) => item.key === "knowledge")?.rows ?? []} /> : null}
      {definition.group === "models" ? <ModelToolActions models={snapshot.panels.find((item) => item.key === "models")?.rows ?? []} path={definition.path} tools={snapshot.panels.find((item) => item.key === "tools")?.rows ?? []} /> : null}
      {definition.group === "observability" ? <ObservabilityActions backups={snapshot.panels.find((item) => item.key === "backups")?.rows ?? []} jobs={snapshot.panels.find((item) => item.key === "jobs")?.rows ?? []} queues={snapshot.panels.find((item) => item.key === "queues")?.rows ?? []} workers={snapshot.panels.find((item) => item.key === "workers")?.rows ?? []} /> : null}

      <div className="admin-ops-panels">
        {selectedPanels.map((item) => <DataPanel key={item.key} panel={item} />)}
      </div>
    </main>
  );
}