"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";

type AcademyDashboardData = {
  candidates: number;
  students: number;
  graduates: number;
  certifiedAgents: number;
  failedRejected: number;
  courses: number;
  exams: number;
  certifications: number;
  retrainingQueue: number;
  labsAwaitingProvider: number;
  passRate: number;
  programs: number;
  curriculumVersions: number;
  activeCohorts: number;
  openDemand: number;
  workforceGap: number;
  geographyNodes: number;
  verifiedGeographicKnowledge: number;
  activeRuntimeAllocations: number;
  recertificationDue: number;
  academyRoles: number;
  configuredQueues: number;
  queuedWork: number;
  leasedWork: number;
  localSandboxRuns: number;
  deferredSandboxRuns: number;
  bestAgents: Array<{ name: string; score: number; certifications: number }>;
  weakestSkills: Array<{ name: string; score: number; learners: number }>;
};

const emptyDashboard: AcademyDashboardData = {
  candidates: 0, students: 0, graduates: 0, certifiedAgents: 0, failedRejected: 0,
  courses: 0, exams: 0, certifications: 0, retrainingQueue: 0, labsAwaitingProvider: 0,
  passRate: 0, programs: 0, curriculumVersions: 0, activeCohorts: 0, openDemand: 0,
  workforceGap: 0, geographyNodes: 0, verifiedGeographicKnowledge: 0,
  activeRuntimeAllocations: 0, recertificationDue: 0, academyRoles: 0,
  configuredQueues: 0,
  queuedWork: 0, leasedWork: 0, localSandboxRuns: 0, deferredSandboxRuns: 0,
  bestAgents: [], weakestSkills: [],
};

export function AcademyDashboard() {
  const [academy, setAcademy] = useState<AcademyDashboardData>(emptyDashboard);
  const [feedback, setFeedback] = useState("");
  const [demand, setDemand] = useState({ title: "", requiredCount: "1", priority: "50" });
  const [geography, setGeography] = useState({ name: "", type: "COUNTRY" });

  async function refresh() {
    const response = await fetch("/api/admin/academy", { cache: "no-store" });
    const payload = await response.json();
    if (response.ok && payload.success) setAcademy(payload.academy);
  }

  useEffect(() => {
    let active = true;
    fetch("/api/admin/academy", { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        if (payload?.success) setAcademy(payload.academy);
        else setFeedback("تعذر تحميل بيانات الأكاديمية.");
      })
      .catch(() => {
        if (active) setFeedback("تعذر تحميل بيانات الأكاديمية.");
      });
    return () => {
      active = false;
    };
  }, []);

  async function submitDemand(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    const response = await fetch("/api/admin/academy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createDemand", title: demand.title, requiredCount: Number(demand.requiredCount), priority: Number(demand.priority) }),
    });
    const payload = await response.json();
    setFeedback(response.ok && payload.success ? "تم تسجيل الطلب وتحديث فجوة القوى العاملة." : (payload.message ?? "تعذر تسجيل الطلب."));
    if (response.ok) { setDemand({ title: "", requiredCount: "1", priority: "50" }); await refresh(); }
  }

  async function submitGeography(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    const response = await fetch("/api/admin/academy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "createGeography", name: geography.name, type: geography.type }),
    });
    const payload = await response.json();
    setFeedback(response.ok && payload.success ? "تم إنشاء عقدة جغرافية جديدة." : (payload.message ?? "تعذر إنشاء العقدة الجغرافية."));
    if (response.ok) { setGeography({ name: "", type: "COUNTRY" }); await refresh(); }
  }

  const metrics = [
    ["المرشحون", academy.candidates], ["الطلاب", academy.students], ["المعتمدون", academy.certifiedAgents],
    ["الفجوة المطلوبة", academy.workforceGap], ["إعادة التدريب", academy.retrainingQueue], ["إعادة الاعتماد", academy.recertificationDue],
  ];

  return (
    <main className="shell robot-admin-shell" dir="rtl">
      <section className="robot-hero card">
        <div><div className="kicker">JENAN DIGITAL WORKFORCE</div><h1>أكاديمية القوى الرقمية</h1><p>الهوية المهنية منفصلة عن الـruntime، والاعتماد يعتمد على evidence ومهارة واختبار ومراجعة مستقلة.</p></div>
        <div className="owner-summary"><span className="pill"><span className="live-dot" /> {academy.activeRuntimeAllocations} runtime نشط</span><strong>{academy.passRate}%</strong><small>نسبة اجتياز موثقة</small></div>
      </section>

      <section className="stats-grid stats-grid--admin">{metrics.map(([label, value], index) => <Card key={String(label)} className="stat-card"><span className={`stat-card__icon accent-${(index % 4) + 1}`} /><div><p>{label}</p><strong>{value}</strong><small>بيانات حقيقية</small></div></Card>)}</section>

      <section className="owner-grid">
        <Card className="owner-panel"><header className="panel-header"><h2>تخطيط القوى العاملة</h2><span>{academy.openDemand} طلبات مفتوحة</span></header><form className="robot-generation-form" onSubmit={submitDemand}><label>احتياج جديد<input required value={demand.title} onChange={(event) => setDemand({ ...demand, title: event.target.value })} /></label><label>العدد<input required type="number" min="0" value={demand.requiredCount} onChange={(event) => setDemand({ ...demand, requiredCount: event.target.value })} /></label><label>الأولوية<input required type="number" min="0" max="100" value={demand.priority} onChange={(event) => setDemand({ ...demand, priority: event.target.value })} /></label><button className="btn primary" type="submit">تسجيل الطلب</button></form></Card>
        <Card className="owner-panel"><header className="panel-header"><h2>الذكاء الجغرافي</h2><span>{academy.geographyNodes} عقد</span></header><form className="robot-generation-form" onSubmit={submitGeography}><label>اسم الموقع<input required value={geography.name} onChange={(event) => setGeography({ ...geography, name: event.target.value })} /></label><label>المستوى<select value={geography.type} onChange={(event) => setGeography({ ...geography, type: event.target.value })}><option value="WORLD">العالم</option><option value="COUNTRY">دولة</option><option value="REGION">منطقة</option><option value="CITY">مدينة</option><option value="DISTRICT">حي</option><option value="LOCAL_ZONE">نطاق محلي</option></select></label><button className="btn primary" type="submit">إضافة عقدة</button></form></Card>
      </section>
      {feedback && <p className="robot-generation-feedback" role="status">{feedback}</p>}

      <section className="owner-grid lower-grid">
        <Card className="owner-panel"><header className="panel-header"><h2>الأفضل أداءً</h2><span>Skills Passport</span></header><div className="rank-list">{academy.bestAgents.length ? academy.bestAgents.map((agent, index) => <div key={agent.name} className="rank-row"><div className="rank-badge">#{index + 1}</div><div className="rank-info"><strong>{agent.name}</strong><small>{agent.certifications} شهادات سارية</small></div><b>{agent.score}%</b></div>) : <p>لا توجد بيانات اعتماد مكتملة بعد.</p>}</div></Card>
        <Card className="owner-panel"><header className="panel-header"><h2>أضعف المهارات</h2><span>إشارة إعادة التدريب</span></header><div className="rank-list">{academy.weakestSkills.map((skill) => <div key={skill.name} className="rank-row"><div className="rank-info"><strong>{skill.name}</strong><small>{skill.learners} ملفات مهارة</small></div><b>{skill.score}%</b></div>)}</div></Card>
      </section>

      <section className="owner-grid lower-grid"><Card className="owner-panel"><header className="panel-header"><h2>المناهج والدفعات</h2><span>Versioned</span></header><div className="mission-list"><div className="mission-item"><span>البرامج</span><b>{academy.programs}</b></div><div className="mission-item"><span>نسخ المناهج</span><b>{academy.curriculumVersions}</b></div><div className="mission-item"><span>الدفعات النشطة</span><b>{academy.activeCohorts}</b></div><div className="mission-item"><span>أدوار الأكاديمية</span><b>{academy.academyRoles}</b></div></div></Card><Card className="owner-panel"><header className="panel-header"><h2>الطوابير والمختبرات</h2><span>Durable</span></header><div className="mission-list"><div className="mission-item"><span>queues مهيأة</span><b>{academy.configuredQueues}</b></div><div className="mission-item"><span>بانتظار التنفيذ</span><b>{academy.queuedWork}</b></div><div className="mission-item"><span>leases نشطة</span><b>{academy.leasedWork}</b></div><div className="mission-item"><span>مختبرات محلية</span><b>{academy.localSandboxRuns}</b></div><div className="mission-item"><span>مؤجلة لمزود AI</span><b>{academy.deferredSandboxRuns}</b></div></div><p>{academy.labsAwaitingProvider} مختبرات تحتاج AI حقيقياً. لا تُصدر هذه اللوحة نتائج AI إنتاجية قبل تفعيل مزود خارجي.</p><p>{academy.verifiedGeographicKnowledge} سجلات جغرافية موثقة أو عالية الثقة.</p></Card></section>
    </main>
  );
}