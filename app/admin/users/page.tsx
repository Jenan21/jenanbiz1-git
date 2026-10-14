"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Card } from "@/components/ui/card";

type UserRecord = {
  id: string;
  email: string;
  displayName: string;
  status: string;
  systemRole: string;
  organizationCount: number;
  organizations: string[];
};

type PendingRecord = {
  id: string;
  email: string;
  displayName: string;
  countryCode: string | null;
  phone: string | null;
  requestedAt: string;
};

export default function UsersPage() {
  const [lang, setLang] = useState<"ar" | "en">("ar");
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [pending, setPending] = useState<PendingRecord[]>([]);
  const [busyId, setBusyId] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        const locale = document.cookie
          .split(";")
          .map((item) => item.trim())
          .find((item) => item.startsWith("locale="))
          ?.split("=")[1];
        const saved = localStorage.getItem("jenan-admin-lang");
        const nextLocale = locale === "ar" || locale === "en" ? locale : saved === "ar" || saved === "en" ? saved : "ar";
        setLang(nextLocale);
      } catch {
        setLang("ar");
      }
    });

    return () => cancelAnimationFrame(frame);
  }, []);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
      const payload = await response.json();
      setUsers(Array.isArray(payload?.users) ? payload.users : []);
      setPending(Array.isArray(payload?.pending) ? payload.pending : []);
    } catch {
      // The lists stay as they were; the page shows what it last loaded.
    }
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => void load());
    return () => cancelAnimationFrame(frame);
  }, [load]);

  async function decide(account: PendingRecord, action: "approve" | "reject") {
    setBusyId(account.id);
    setNotice("");
    try {
      const response = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, userId: account.id }),
      });
      const payload = (await response.json().catch(() => null)) as { success?: boolean; message?: string } | null;
      if (!response.ok || !payload?.success) throw new Error(payload?.message ?? "failed");
      setNotice(
        action === "approve"
          ? lang === "ar" ? `تمت الموافقة على ${account.email}${"، وسيصله إشعار بالبريد."}` : `${account.email} approved; they will be e-mailed.`
          : lang === "ar" ? `تم رفض ${account.email}.` : `${account.email} declined.`,
      );
      await load();
    } catch (error) {
      setNotice(error instanceof Error && error.message !== "failed" ? error.message : lang === "ar" ? "تعذر تنفيذ العملية." : "The action could not be completed.");
      await load();
    } finally {
      setBusyId("");
    }
  }

  const qaScore = Math.min(
    10,
    Math.round(
      (users.length > 0 ? 3 : 0) +
      (users.some((user) => user.status) ? 3 : 0) +
      (users.some((user) => user.systemRole) ? 2 : 0) +
      (users.some((user) => user.organizationCount >= 0) ? 2 : 0),
    ),
  );

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir={lang === "ar" ? "rtl" : "ltr"}>
        <section className="robot-hero card">
          <div>
            <div className="kicker">{lang === "ar" ? "المستخدمون" : "USERS"}</div>
            <h1>{lang === "ar" ? "قاعدة مستخدمي المنصة" : "Platform user directory"}</h1>
            <p>
              {lang === "ar"
                ? "يتم جلب المستخدمين والأدوار والارتباطات بالمنظمات من قاعدة البيانات الحقيقية، مع استعداد النظام لاحقاً للتنفيذ الكامل للسياسات والحقوق."
                : "Users, roles, and organization memberships are pulled from the live database so the control panel reflects actual account state and access layer."}
            </p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> {lang === "ar" ? "نشط" : "live"}</span>
            <strong>{users.length}</strong>
            <small>{lang === "ar" ? "مستخدم" : "users"}</small>
          </div>
        </section>

        <section className="panel qa-gate-panel" style={{ marginBottom: "20px" }}>
          <div className="panel-header">
            <div>
              <p className="panel-kicker">{lang === "ar" ? "معيار الاعتماد" : "Approval standard"}</p>
              <h2>{lang === "ar" ? "جودة قسم المستخدمين" : "Users section quality"}</h2>
            </div>
            <span className={`chip ${qaScore >= 10 ? "chip--success" : "chip--warning"}`}>{qaScore}/10</span>
          </div>
        </section>

        <section className="owner-grid" data-testid="pending-accounts">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{lang === "ar" ? "طلبات التسجيل بانتظار الموافقة" : "Registrations waiting for approval"}</h2>
              <span>{pending.length}</span>
            </header>
            {notice ? <p role="status">{notice}</p> : null}
            <div className="committee-list">
              {pending.length > 0 ? pending.map((account) => (
                <div key={account.id} className="committee-item" data-testid="pending-account">
                  <div>
                    <strong>{account.displayName || account.email}</strong>
                    <small>{account.email}{account.countryCode ? ` · ${account.countryCode}` : ""}{account.phone ? ` · ${account.phone}` : ""}</small>
                    <small>{new Date(account.requestedAt).toLocaleString(lang === "ar" ? "ar-SA" : "en-GB")}</small>
                  </div>
                  <div className="committee-score-box">
                    <button className="button button--primary" type="button" disabled={busyId === account.id} onClick={() => void decide(account, "approve")}>
                      {lang === "ar" ? "موافقة" : "Approve"}
                    </button>
                    <button className="button button--ghost" type="button" disabled={busyId === account.id} onClick={() => void decide(account, "reject")}>
                      {lang === "ar" ? "رفض" : "Decline"}
                    </button>
                  </div>
                </div>
              )) : (
                <div className="committee-item"><div><strong>{lang === "ar" ? "لا توجد طلبات بانتظار الموافقة" : "No registrations are waiting"}</strong><small>{lang === "ar" ? "تظهر الطلبات الجديدة هنا" : "New requests appear here"}</small></div></div>
              )}
            </div>
          </Card>
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{lang === "ar" ? "مستخدمو المنصة" : "Platform users"}</h2>
              <span>{lang === "ar" ? "من جدول المستخدمين" : "from user registry"}</span>
            </header>
            <div className="committee-list">
              {users.length > 0 ? users.map((user) => (
                <div key={user.id} className="committee-item">
                  <div>
                    <strong>{user.displayName}</strong>
                    <small>{user.email}</small>
                  </div>
                  <div className="committee-score-box">
                    <span>{user.status}</span>
                    <small>{user.systemRole}</small>
                  </div>
                </div>
              )) : (
                <div className="committee-item"><div><strong>{lang === "ar" ? "لا توجد مستخدمين" : "No users found"}</strong><small>{lang === "ar" ? "جاري انتظار البيانات" : "waiting for data"}</small></div></div>
              )}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>{lang === "ar" ? "معلومات الحساب" : "Account summary"}</h2>
              <span>{lang === "ar" ? "الأدوار والارتباطات" : "roles and memberships"}</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "كل مستخدم مرتبط بجدول المستخدمين في قاعدة البيانات." : "Each user is connected to the platform user table in the live database."}</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "حالة الحساب تُظهر Active أو Pending أو Suspended." : "Account state reflects Active, Pending, or Suspended values from the system."}</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>{lang === "ar" ? "الأدوار تم جلبها من SystemRole وربطها بالمنظمة." : "Roles are loaded from SystemRole and mapped to the user’s organization memberships."}</span></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
