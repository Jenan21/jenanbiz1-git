import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

const robotDetail = {
  "rb-1042": {
    name: "Core Dev Prime",
    team: "Development",
    intelligence: 98,
    skill: 96,
    experience: 93,
    status: "Ready",
    focus: ["Platform systems", "Product scaling", "Automation flows"],
    inherited: ["Architecture depth", "Quality filters", "Release logic"],
    report: "High confidence in system design, automation, and long-term product resilience.",
  },
  "rb-2048": {
    name: "Signal Forge",
    team: "Innovation",
    intelligence: 97,
    skill: 95,
    experience: 92,
    status: "Ready",
    focus: ["Experiment design", "Growth loops", "Opportunity mapping"],
    inherited: ["Pattern discovery", "Strategic noise filtering", "Trend synthesis"],
    report: "High-quality ideation engine with a consistent track record of finding winning propositions.",
  },
  "rb-3304": {
    name: "Trust Pilot",
    team: "User Interaction",
    intelligence: 95,
    skill: 94,
    experience: 90,
    status: "Ready",
    focus: ["Trust building", "Feedback loops", "User retention"],
    inherited: ["Community trust", "Retention strategy", "Verbal confidence design"],
    report: "Strong at building confidence, maintaining trust, and keeping users engaged over time.",
  },
};

export default function RobotDetailsPage({ params }: { params: { robotId: string } }) {
  const robot = robotDetail[params.robotId.toLowerCase() as keyof typeof robotDetail];

  if (!robot) {
    return (
      <main className="shell">
        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Robot not found</h2>
          </header>
          <p className="placeholder-value">This robot record is not available in the current intelligence registry.</p>
        </Card>
      </main>
    );
  }

  return (
    <main className="shell robot-admin-shell">
      <section className="robot-hero card">
        <div>
          <div className="kicker">ROBOT PROFILE</div>
          <h1>{robot.name}</h1>
          <p>{robot.report}</p>
        </div>
        <div className="owner-summary">
          <span className="pill"><span className="live-dot" /> {robot.status}</span>
          <strong>{robot.team}</strong>
          <small>{robot.intelligence}% intelligence</small>
        </div>
      </section>

      <section className="stats-grid stats-grid--admin">
        <Card className="stat-card">
          <span className="stat-card__icon accent-1"><Icon name="sparkles" /></span>
          <div>
            <p>Intelligence</p>
            <strong>{robot.intelligence}%</strong>
            <small>decision quality</small>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__icon accent-2"><Icon name="brain" /></span>
          <div>
            <p>Skill</p>
            <strong>{robot.skill}%</strong>
            <small>capability score</small>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__icon accent-3"><Icon name="activity" /></span>
          <div>
            <p>Experience</p>
            <strong>{robot.experience}%</strong>
            <small>learned depth</small>
          </div>
        </Card>
      </section>

      <section className="owner-grid">
        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Core focus</h2>
            <span>Primary strengths</span>
          </header>
          <div className="mission-list">
            {robot.focus.map((item) => (
              <div key={item} className="mission-item">
                <span className="mission-icon"><Icon name="check" /></span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Inherited knowledge</h2>
            <span>Knowledge lineage</span>
          </header>
          <div className="committee-list">
            {robot.inherited.map((item) => (
              <div key={item} className="committee-item">
                <div>
                  <strong>{item}</strong>
                </div>
                <span>Active</span>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </main>
  );
}
