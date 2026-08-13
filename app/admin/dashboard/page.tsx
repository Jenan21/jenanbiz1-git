export const metadata = {
  title: "Admin Dashboard",
};

export default function AdminDashboard() {
  return (
    <main className="shell">
      <div className="page-grid">
        <aside className="side-stack">
          <div className="card">
            <div className="card-title">Admin</div>
            <div className="card-sub">Control center</div>
          </div>
        </aside>
        <section className="main-stack">
          <div className="grid-3">
            <div className="card">
              <div className="card-title">Users</div>
              <div className="placeholder-value">Active users, recent signups and actions</div>
            </div>
            <div className="card">
              <div className="card-title">Projects</div>
              <div className="placeholder-value">Recent projects and status</div>
            </div>
            <div className="card">
              <div className="card-title">System</div>
              <div className="placeholder-value">Health checks and logs</div>
            </div>
          </div>
          <div className="card" style={{ marginTop: 14 }}>
            <div className="card-title">Quick Actions</div>
            <div className="card-sub">Bootstrap, backups, and maintenance</div>
          </div>
        </section>
        <aside className="right-stack">
          <div className="card">
            <div className="card-title">Recent Activity</div>
            <div className="card-sub">Async logs and alerts</div>
          </div>
        </aside>
      </div>
    </main>
  );
}
