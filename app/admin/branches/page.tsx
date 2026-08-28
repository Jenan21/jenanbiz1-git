"use client";

import { useEffect, useState } from "react";
import { AdminShell } from "@/components/admin/admin-shell";
import { Icon } from "@/components/ui/icons";

type BranchRecord = {
  id: string;
  name: string;
  slug: string;
  memberCount: number;
  activeMembers: number;
  subscriptionCount: number;
  createdAt: string;
};

function BranchCard({ branch }: { branch: BranchRecord }) {
  const activity =
    branch.memberCount > 0
      ? Math.round((branch.activeMembers / branch.memberCount) * 100)
      : 0;

  return (
    <div className="ds-branch-card glass-card">
      <div className="ds-branch-card__icon">
        <Icon name="building" />
      </div>
      <div>
        <div className="ds-branch-card__name">{branch.name}</div>
        <div className="ds-branch-card__slug">{branch.slug}</div>
        <div
          style={{
            marginTop: 6,
            height: 3,
            borderRadius: 3,
            background: "var(--border)",
            overflow: "hidden",
          }}
          aria-label={`Activity ${activity}%`}
        >
          <div
            style={{
              width: `${activity}%`,
              height: "100%",
              background: "linear-gradient(90deg, var(--brand), var(--blue))",
              borderRadius: 3,
            }}
          />
        </div>
      </div>
      <div className="ds-branch-card__stats">
        <span className="ds-branch-card__count">{branch.activeMembers}</span>
        <span className="ds-branch-card__count-label">
          / {branch.memberCount} members
        </span>
        {branch.subscriptionCount > 0 && (
          <span className="ds-pill" style={{ marginTop: 4, fontSize: 8 }}>
            {branch.subscriptionCount} subs
          </span>
        )}
      </div>
    </div>
  );
}

export default function BranchesPage() {
  const [branches, setBranches] = useState<BranchRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/branches")
      .then((r) => r.json())
      .then((payload) => {
        if (payload?.success) setBranches(payload.branches ?? []);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const totalMembers = branches.reduce((a, b) => a + b.memberCount, 0);
  const totalActive = branches.reduce((a, b) => a + b.activeMembers, 0);

  return (
    <AdminShell>
      <main className="branches-page">
        {/* ── Hero ── */}
        <div className="branches-hero">
          <div>
            <div className="branches-hero__eyebrow">
              <Icon name="building" />
              Branch network
            </div>
            <h1 className="branches-hero__title">Organizations &amp; Branches</h1>
            <p className="branches-hero__subtitle">
              Branch records sourced directly from the database. Each entry shows
              member count, active users, and subscription status.
            </p>
          </div>
          <div style={{ display: "flex", gap: 28 }}>
            <div className="branches-hero__stat">
              <span className="branches-hero__count">{branches.length}</span>
              <span className="branches-hero__count-label">Branches</span>
            </div>
            <div className="branches-hero__stat">
              <span className="branches-hero__count">{totalActive}</span>
              <span className="branches-hero__count-label">Active</span>
            </div>
            <div className="branches-hero__stat">
              <span className="branches-hero__count">{totalMembers}</span>
              <span className="branches-hero__count-label">Members</span>
            </div>
          </div>
        </div>

        {/* ── Branch grid ── */}
        {loading ? (
          <div className="ds-loading">Loading branches…</div>
        ) : branches.length === 0 ? (
          <div className="ds-empty">
            <div className="ds-empty__icon">
              <Icon name="building" />
            </div>
            <strong>No branches found</strong>
            <span>Create branch records in the database to see them here.</span>
          </div>
        ) : (
          <div className="branches-grid">
            {branches.map((branch) => (
              <BranchCard key={branch.id} branch={branch} />
            ))}
          </div>
        )}
      </main>
    </AdminShell>
  );
}

