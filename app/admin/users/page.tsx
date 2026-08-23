"use client";

import { useEffect, useState } from "react";
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

export default function UsersPage() {
  const [users, setUsers] = useState<UserRecord[]>([]);

  useEffect(() => {
    fetch("/api/admin/users")
      .then((response) => response.json())
      .then((payload) => {
        if (payload?.success) {
          setUsers(payload.users ?? []);
        }
      })
      .catch(() => undefined);
  }, []);

  return (
    <AdminShell>
      <main className="shell robot-admin-shell" dir="rtl">
        <section className="robot-hero card">
          <div>
            <div className="kicker">المستخدمون</div>
            <h1>قاعدة مستخدمي المنصة</h1>
            <p>يتم جلب المستخدمين والأدوار والارتباطات بالمنظمات من قاعدة البيانات الحقيقية، مع استعداد النظام لاحقاً للتنفيذ الكامل للسياسات والحقوق.</p>
          </div>
          <div className="owner-summary">
            <span className="pill"><span className="live-dot" /> نشط</span>
            <strong>{users.length}</strong>
            <small>مستخدم</small>
          </div>
        </section>

        <section className="owner-grid">
          <Card className="owner-panel">
            <header className="panel-header">
              <h2>مستخدمو المنصة</h2>
              <span>من جدول المستخدمين</span>
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
                <div className="committee-item"><div><strong>لا توجد مستخدمين</strong><small>جاري انتظار البيانات</small></div></div>
              )}
            </div>
          </Card>

          <Card className="owner-panel">
            <header className="panel-header">
              <h2>معلومات الحساب</h2>
              <span>الأدوار والارتباطات</span>
            </header>
            <div className="mission-list">
              <div className="mission-item"><span className="mission-icon">✓</span><span>كل مستخدم مرتبط بجدول المستخدمين في PostgreSQL.</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>حالة الحساب تُظهر Active أو Pending أو Suspended.</span></div>
              <div className="mission-item"><span className="mission-icon">✓</span><span>الأدوار يتم جلبها من نظام SystemRole وربطها بالمنظمة.</span></div>
            </div>
          </Card>
        </section>
      </main>
    </AdminShell>
  );
}
