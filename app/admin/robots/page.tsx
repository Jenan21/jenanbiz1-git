"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

type RobotRow = {
  id: string;
  name: string;
  team: string;
  intelligence: number;
  skill: number;
  experience: number;
  status: "ACTIVE" | "REVIEW" | "HIDDEN";
};

type RobotApiRecord = {
  id: string;
  name: string;
  team?: string | null;
  intelligence?: number | null;
  skill?: number | null;
  experience?: number | null;
  status: string;
};

function mapRobotRecord(bot: RobotApiRecord): RobotRow {
  return {
    id: bot.id.slice(0, 8).toUpperCase(),
    name: bot.name,
    team: bot.team ?? "Platform",
    intelligence: Number(bot.intelligence ?? 0),
    skill: Number(bot.skill ?? 0),
    experience: Number(bot.experience ?? 0),
    status: bot.status === "HIDDEN" ? "HIDDEN" : bot.status === "REVIEW" ? "REVIEW" : "ACTIVE",
  };
}

const fallbackRanking: RobotRow[] = [
  { id: "RB-1042", name: "Core Dev Prime", team: "التطوير", intelligence: 98, skill: 96, experience: 93, status: "ACTIVE" },
  { id: "RB-2048", name: "Signal Forge", team: "الابتكار", intelligence: 97, skill: 95, experience: 92, status: "ACTIVE" },
  { id: "RB-5011", name: "Pulse Monitor", team: "المراقبة", intelligence: 96, skill: 91, experience: 94, status: "ACTIVE" },
  { id: "RB-3304", name: "Trust Pilot", team: "تفاعل المستخدم", intelligence: 95, skill: 94, experience: 90, status: "ACTIVE" },
  { id: "RB-4018", name: "Deal Whisper", team: "المبيعات", intelligence: 94, skill: 92, experience: 91, status: "REVIEW" },
  { id: "RB-1110", name: "Blend Signal", team: "العمليات", intelligence: 78, skill: 72, experience: 70, status: "HIDDEN" },
];

function statusToLabel(status: RobotRow["status"]) {
  switch (status) {
    case "ACTIVE":
      return "مرئي";
    case "REVIEW":
      return "مراجعة";
    case "HIDDEN":
      return "مخفي";
    default:
      return "مخفي";
  }
}

export default function RobotRankingPage() {
  const [rows, setRows] = useState<RobotRow[]>(fallbackRanking);
  const [form, setForm] = useState({ name: "", team: "", mission: "" });
  const [feedback, setFeedback] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  async function generateRobot(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFeedback("");
    setIsGenerating(true);

    try {
      const response = await fetch("/api/admin/robots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok || !payload.success) {
        setFeedback(payload.message ?? "تعذر إنشاء المرشح");
        return;
      }

      setFeedback(`تم إنشاء ${payload.robot.name} وإرساله إلى المراجعة`);
      setForm({ name: "", team: "", mission: "" });
      const refreshed = await fetch("/api/admin/robots");
      const refreshedPayload = await refreshed.json();
      if (refreshedPayload?.success && Array.isArray(refreshedPayload.snapshot?.robots)) {
        setRows((refreshedPayload.snapshot.robots as RobotApiRecord[]).map(mapRobotRecord));
      }
    } catch {
      setFeedback("تعذر الاتصال بمركز التوليد");
    } finally {
      setIsGenerating(false);
    }
  }

  useEffect(() => {
    let active = true;

    fetch("/api/admin/robots")
      .then((response) => response.json())
      .then((payload) => {
        if (!active || !payload?.success || !Array.isArray(payload.snapshot?.robots)) return;

        const nextRows = (payload.snapshot.robots as RobotApiRecord[]).map(mapRobotRecord);

        if (nextRows.length > 0) {
          setRows(nextRows);
        }
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">تصنيف الذكاء</div>
            <h1>مجموعة الصائدين كاملة</h1>
            <p>
              تحافظ واجهة المالك على المرشحين الضعفاء بعيداً عن المقدمة وتبقي فقط الأفضلية العالية ظاهرة لاتخاذ الإجراءات الفورية.
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> {rows.length} صائد</span>
            <strong>أفضل جودة</strong>
            <small>{rows.filter((robot) => robot.status === "ACTIVE").length} مرئيون</small>
          </div>
        </section>

        <Card className="owner-panel robot-generation-panel">
          <header className="panel-header">
            <div>
              <p className="panel-kicker">توليد مضبوط</p>
              <h2>إنشاء روبوت للتجربة</h2>
            </div>
            <span>يبدأ بالمراجعة</span>
          </header>
          <form className="robot-generation-form" onSubmit={generateRobot}>
            <label>
              اسم الروبوت
              <input required minLength={2} maxLength={80} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label>
              الفريق
              <input required minLength={2} maxLength={80} value={form.team} onChange={(event) => setForm({ ...form, team: event.target.value })} />
            </label>
            <label className="robot-generation-form__mission">
              مهمة التقييم الأولى
              <textarea required minLength={4} maxLength={160} rows={2} value={form.mission} onChange={(event) => setForm({ ...form, mission: event.target.value })} />
            </label>
            <button className="btn primary" type="submit" disabled={isGenerating}>
              {isGenerating ? "جارٍ التوليد..." : "توليد وإرسال للمراجعة"}
            </button>
          </form>
          {feedback && <p className="robot-generation-feedback" role="status">{feedback}</p>}
        </Card>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>الرتبة</h2>
              <span>مرئي / مراجعة / مخفي</span>
            </header>
            <div className="rank-list">
              {rows.map((bot, index) => (
                <div key={bot.id} className="rank-row ranking-row">
                  <div className="rank-badge">#{index + 1}</div>
                  <div className="rank-info">
                    <strong>{bot.name}</strong>
                    <small>{bot.team} · {bot.id}</small>
                  </div>
                  <div className="rank-metrics">
                    <span>{bot.intelligence}%</span>
                    <span>{bot.skill}%</span>
                    <span>{bot.experience}%</span>
                  </div>
                  <span className={`status-badge ${bot.status === "ACTIVE" ? "visible" : bot.status === "REVIEW" ? "review" : "hidden"}`}>{statusToLabel(bot.status)}</span>
                </div>
              ))}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>قواعد التصفية</h2>
              <span>سياسة المالك</span>
            </header>
            <div className="mission-list">
              <div className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>احتفظ فقط بالصائدين الذين تزيد ذكاءاتهم عن 90</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>اعرض المرشحين في وضع المراجعة</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>أخفِ الوكلاء الضعفاء من لوحة التشغيل المباشر</span>
              </div>
              <div className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>رتب حسب الملاءمة والمهارة ومنحنى التعلم</span>
              </div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
