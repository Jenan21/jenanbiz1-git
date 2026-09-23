"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

type CoverageRole = { role: string; roleLabel: string; robot: { id: string; name: string; status: string; tasks: number } | null };
type CoverageSection = { complete: boolean; roles: CoverageRole[]; section: string; sectionLabel: string };
type CoveragePayload = { covered: number; coverage: CoverageSection[]; required: number; rolesPerSection: number; totalRobots: number };

export default function RobotCoveragePage() {
  const [coverage, setCoverage] = useState<CoveragePayload | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/robot-coverage", { cache: "no-store" });
    const payload = await response.json().catch(() => null) as { coverage?: CoveragePayload; message?: string; success?: boolean } | null;
    if (response.ok && payload?.coverage) setCoverage(payload.coverage);
    else setMessage(payload?.message ?? "تعذر تحميل تغطية الروبوتات.");
  }

  async function ensureCoverage() {
    setBusy(true);
    setMessage("");
    const response = await fetch("/api/admin/robot-coverage", { method: "POST" });
    const payload = await response.json().catch(() => null) as { coverage?: CoveragePayload; message?: string; success?: boolean } | null;
    if (response.ok && payload?.coverage) {
      setCoverage(payload.coverage);
      setMessage("تم ضمان روبوتات التشغيل والصيانة والتطوير والابتكار لكل قسم.");
    } else {
      setMessage(payload?.message ?? "تعذر ضمان التغطية.");
    }
    setBusy(false);
  }

  useEffect(() => { void load(); }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div><div className="kicker">Platform Robot Coverage</div><h1>مركز تشغيل روبوتات الأقسام</h1><p>يربط كل قسم بروبوتات تشغيل وصيانة وتطوير وابتكار، مع مهام مراقبة قابلة للتدقيق والتصعيد للجنة.</p></div>
          <div className="owner-summary"><span className="pill"><span className="live-dot" /> {coverage?.totalRobots ?? 0} روبوت تغطية</span><strong>{coverage ? `${coverage.covered}/${coverage.required}` : "—"}</strong><small>أقسام مكتملة</small></div>
        </section>
        <section className="panel qa-gate-panel" style={{ marginBottom: "20px" }}><div className="panel-header"><div><p className="panel-kicker">Coverage gate</p><h2>ضمان التغطية</h2></div><button className="btn primary" disabled={busy} onClick={() => void ensureCoverage()} type="button">{busy ? "جارٍ الضمان..." : "ضمان كل الأقسام"}</button></div>{message ? <p className="robot-generation-feedback" role="status">{message}</p> : null}</section>
        <section className="owner-grid">
          {coverage?.coverage.map((section) => <Card className="owner-panel" key={section.section}><header className="panel-header"><h2>{section.sectionLabel}</h2><span>{section.complete ? "مكتمل" : "ناقص"}</span></header><div className="mission-list">{section.roles.map((role) => <div className="mission-item" key={role.role}><span className="mission-icon"><Icon name={role.robot ? "check" : "x"} /></span><span><strong>{role.roleLabel}</strong><br />{role.robot ? `${role.robot.name} · ${role.robot.tasks} مهام` : "لا يوجد روبوت"}</span></div>)}</div></Card>)}
        </section>
      </main>
    </AdminShell>
  );
}