import { notFound } from "next/navigation";
import { SystemRole } from "@/generated/prisma/client";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { db } from "@/lib/db";
import { requireSystemRole } from "@/lib/auth/session";

export default async function RobotDetailsPage({ params }: { params: Promise<{ robotId: string }> }) {
  await requireSystemRole([SystemRole.ADMIN, SystemRole.SUPER_ADMIN]);
  const { robotId } = await params;
  const robot = await db.robot.findUnique({
    where: { id: robotId },
    include: {
      genome: { include: { skillPacks: { include: { skillPack: true } }, knowledgePacks: { include: { knowledgePack: true } } } },
      runtimeAllocations: { orderBy: { allocatedAt: "desc" }, take: 8 },
      academicProfile: {
        include: {
          primarySpecialization: { include: { field: true } },
          secondarySpecializations: { include: { specialization: true } },
          skills: { include: { skill: true }, orderBy: { level: "desc" } },
          certifications: { include: { certification: true }, orderBy: { expiresAt: "asc" } },
          retrainingEvents: { orderBy: { createdAt: "desc" }, take: 8 },
          geographyProfiles: { include: { geographyNode: true } },
          experienceRecords: { orderBy: { createdAt: "desc" }, take: 8 },
        },
      },
    },
  });
  if (!robot) notFound();

  const profile = robot.academicProfile;
  const activeCertificates = profile?.certifications.filter((record) => record.status === "CERTIFIED" && (!record.expiresAt || record.expiresAt > new Date())) ?? [];
  const score = profile ? Math.round((profile.theoryScore + profile.practicalScore + profile.blindExamScore + profile.realWorldScore) / 4) : 0;

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div><div className="kicker">AGENT ACADEMIC PASSPORT</div><h1>{robot.name}</h1><p>{robot.notes ?? "هوية Agent دائمة؛ الـruntime يخصص ويطلق لكل مهمة مستقلة."}</p></div>
          <div className="owner-summary"><span className="pill"><span className="live-dot" /> {profile?.status ?? "UNENROLLED"}</span><strong>{robot.team ?? "Platform"}</strong><small>{activeCertificates.length} شهادات تشغيلية سارية</small></div>
        </section>

        <section className="stats-grid stats-grid--admin">
          <Card className="stat-card"><div><p>Academic score</p><strong>{score}%</strong><small>theory + practical + blind + real-world</small></div></Card>
          <Card className="stat-card"><div><p>Trust</p><strong>{profile?.trustScore ?? 0}%</strong><small>reliability and validated evidence</small></div></Card>
          <Card className="stat-card"><div><p>Safety</p><strong>{profile?.safetyScore ?? 0}%</strong><small>risk-aware performance</small></div></Card>
          <Card className="stat-card"><div><p>Runtime leases</p><strong>{robot.runtimeAllocations.filter((item) => item.status === "ALLOCATED").length}</strong><small>active allocated workers</small></div></Card>
        </section>

        <section className="owner-grid">
          <Card className="owner-panel"><header className="panel-header"><h2>Skills Passport</h2><span>Verified levels</span></header><div className="rank-list">{profile?.skills.length ? profile.skills.map((item) => <div key={item.skillId} className="rank-row"><div className="rank-info"><strong>{item.skill.name}</strong><small>Theory {item.theoryScore}% · Practical {item.practicalScore}% · Blind {item.blindScore}%</small></div><b>{item.level}</b></div>) : <p>لا توجد مهارات موثقة بعد.</p>}</div></Card>
          <Card className="owner-panel"><header className="panel-header"><h2>Certifications</h2><span>Expiry aware</span></header><div className="rank-list">{profile?.certifications.length ? profile.certifications.map((item) => <div key={item.id} className="rank-row"><div className="rank-info"><strong>{item.certification.name}</strong><small>{item.expiresAt ? `Expires ${item.expiresAt.toLocaleDateString()}` : "No expiry"}</small></div><b>{item.status}</b></div>) : <p>لا توجد شهادات بعد.</p>}</div></Card>
        </section>

        <section className="owner-grid lower-grid">
          <Card className="owner-panel"><header className="panel-header"><h2>Identity & Genome</h2><span>Shared capability</span></header><div className="mission-list"><div className="mission-item"><span>Primary specialization</span><b>{profile?.primarySpecialization ? `${profile.primarySpecialization.field.name} / ${profile.primarySpecialization.name}` : "Not assigned"}</b></div><div className="mission-item"><span>Secondary</span><b>{profile?.secondarySpecializations.map((item) => item.specialization.name).join(", ") || "None"}</b></div><div className="mission-item"><span>Genome</span><b>{robot.genome?.name ?? "Not assigned"}</b></div><div className="mission-item"><span>Skill packs</span><b>{robot.genome?.skillPacks.map((item) => item.skillPack.name).join(", ") || "None"}</b></div><div className="mission-item"><span>Knowledge packs</span><b>{robot.genome?.knowledgePacks.map((item) => item.knowledgePack.name).join(", ") || "None"}</b></div></div></Card>
          <Card className="owner-panel"><header className="panel-header"><h2>Performance & Remediation</h2><span>Evidence driven</span></header><div className="rank-list">{profile?.experienceRecords.map((item) => <div key={item.id} className="rank-row"><div className="rank-info"><strong>{item.title}</strong><small>{item.outcome} · risk {item.risk} · quality {item.qualityScore}%</small></div><b>{item.validated ? "Validated" : "Pending"}</b></div>)}{profile?.retrainingEvents.map((item) => <div key={item.id} className="rank-row"><div className="rank-info"><strong>Retraining</strong><small>{item.reason}</small></div><b>{item.status}</b></div>)}{!profile?.experienceRecords.length && !profile?.retrainingEvents.length && <p>لا توجد خبرات أو إعادة تدريب بعد.</p>}</div></Card>
        </section>

        <section className="owner-grid lower-grid"><Card className="owner-panel"><header className="panel-header"><h2>Geography</h2><span>Composition</span></header><div className="rank-list">{profile?.geographyProfiles.length ? profile.geographyProfiles.map((item) => <div key={item.geographyNodeId} className="rank-row"><div className="rank-info"><strong>{item.geographyNode.name}</strong><small>{item.geographyNode.type} · freshness {item.knowledgeFreshness}%</small></div><b>{item.proficiency}</b></div>) : <p>لا توجد تغطية جغرافية بعد.</p>}</div></Card><Card className="owner-panel"><header className="panel-header"><h2>Runtime History</h2><span>Identity ≠ worker</span></header><div className="rank-list">{robot.runtimeAllocations.length ? robot.runtimeAllocations.map((item) => <div key={item.id} className="rank-row"><div className="rank-info"><strong>{item.runtimeKey}</strong><small>{item.allocatedAt.toLocaleString()}</small></div><b>{item.status}</b></div>) : <p>لم يخصص runtime لهذا Agent بعد.</p>}</div></Card></section>
      </main>
    </AdminShell>
  );
}
