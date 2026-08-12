import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icons";

interface AdminContentProps {
  copy: {
    eyebrow: string;
    title: string;
    subtitle: string;
    stats: Array<{ label: string; value: string; icon: IconName }>;
    overview: string;
    health: string;
    healthy: string;
    modules: string[];
  };
}

export function AdminContent({ copy }: AdminContentProps) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="shield" />
            {copy.eyebrow}
          </p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <span className="system-health">
          <i />
          {copy.healthy}
        </span>
      </section>
      <section className="stats-grid stats-grid--admin">
        {copy.stats.map((stat, index) => (
          <Card className="stat-card" key={stat.label}>
            <span className={`stat-card__icon accent-${index + 1}`}>
              <Icon name={stat.icon} />
            </span>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <small>—</small>
            </div>
          </Card>
        ))}
      </section>
      <section className="admin-grid">
        <Card className="admin-overview">
          <header>
            <h2>{copy.overview}</h2>
            <span>30D</span>
          </header>
          <div className="chart-placeholder" aria-label="Chart placeholder">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        </Card>
        <Card className="health-card">
          <h2>{copy.health}</h2>
          {copy.modules.map((module) => (
            <div className="health-row" key={module}>
              <span>{module}</span>
              <span>
                <i />
                {copy.healthy}
              </span>
            </div>
          ))}
        </Card>
      </section>
    </>
  );
}
