import Link from "next/link";
import { Card } from "@/components/ui/card";

export default function Forbidden() {
  return (
    <main className="auth-page">
      <Card className="auth-panel">
        <p className="eyebrow">403</p>
        <h1>Access denied</h1>
        <p className="auth-panel__subtitle">
          You do not have permission to access this area.
        </p>
        <div className="home-actions">
          <Link className="button button--primary" href="/dashboard">
            Dashboard
          </Link>
        </div>
      </Card>
    </main>
  );
}
