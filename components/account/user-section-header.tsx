import type { ReactNode } from "react";

export function UserSectionHeader({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) {
  return (
    <header className="user-section-header">
      <div><span className="eyebrow eyebrow--small">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action ? <div>{action}</div> : null}
    </header>
  );
}