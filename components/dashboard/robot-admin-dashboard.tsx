"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

const fallbackTopBots = [
  {
    id: "RB-1042",
    name: "Core Dev Prime",
    team: "Development",
    intelligence: 98,
    skill: 96,
    experience: 93,
    status: "Ready",
    fit: "Build & optimize platform systems",
  },
  {
    id: "RB-2048",
    name: "Signal Forge",
    team: "Innovation",
    intelligence: 97,
    skill: 95,
    experience: 92,
    status: "Ready",
    fit: "Product experiments and strategy loops",
  },
  {
    id: "RB-3304",
    name: "Trust Pilot",
    team: "User Interaction",
    intelligence: 95,
    skill: 94,
    experience: 90,
    status: "Ready",
    fit: "User trust, feedback, and retention",
  },
  {
    id: "RB-4018",
    name: "Deal Whisper",
    team: "Sales",
    intelligence: 94,
    skill: 92,
    experience: 91,
    status: "Monitoring",
    fit: "Sales funnel and conversion plays",
  },
  {
    id: "RB-5011",
    name: "Pulse Monitor",
    team: "Supervision",
    intelligence: 96,
    skill: 91,
    experience: 94,
    status: "Ready",
    fit: "Oversight, alerts, and anomaly checks",
  },
  {
    id: "RB-6027",
    name: "Growth Atlas",
    team: "Marketing",
    intelligence: 93,
    skill: 90,
    experience: 89,
    status: "Ready",
    fit: "Campaign testing and acquisition loops",
  },
  {
    id: "RB-7109",
    name: "Patch Keeper",
    team: "Maintenance",
    intelligence: 92,
    skill: 93,
    experience: 90,
    status: "Ready",
    fit: "System stability and patching",
  },
  {
    id: "RB-8041",
    name: "Audience Echo",
    team: "Acquisition",
    intelligence: 91,
    skill: 89,
    experience: 88,
    status: "Review",
    fit: "Channel reach and user growth",
  },
  {
    id: "RB-9202",
    name: "Launch Vector",
    team: "Operations",
    intelligence: 90,
    skill: 88,
    experience: 87,
    status: "Ready",
    fit: "Launch execution and sequencing",
  },
  {
    id: "RB-10021",
    name: "Insight Loop",
    team: "Innovation",
    intelligence: 94,
    skill: 90,
    experience: 91,
    status: "Ready",
    fit: "Insight generation and pattern detection",
  },
];

const teamSummary = [
  { label: "Development", value: "980", trend: "+12%" },
  { label: "Innovation", value: "760", trend: "+18%" },
  { label: "Operations", value: "640", trend: "+9%" },
  { label: "Marketing", value: "820", trend: "+15%" },
  { label: "User Interaction", value: "540", trend: "+11%" },
];

type RobotApiRecord = {
  id: string;
  name: string;
  intelligence?: number | null;
  skill?: number | null;
  experience?: number | null;
  status: string;
};

const committeeMembers = [
  { name: "Council-01", role: "Strategic review", score: 98 },
  { name: "Council-07", role: "Growth analysis", score: 97 },
  { name: "Council-12", role: "System health", score: 96 },
  { name: "Council-19", role: "Trust and retention", score: 95 },
  { name: "Council-25", role: "Mission prioritization", score: 94 },
];

const missionAssignments = [
  {
    task: "Platform core upgrades",
    best: ["Core Dev Prime", "Signal Forge", "Patch Keeper"],
  },
  {
    task: "Growth loop optimization",
    best: ["Growth Atlas", "Signal Forge", "Insight Loop"],
  },
  {
    task: "Trust and conversion review",
    best: ["Trust Pilot", "Deal Whisper", "Audience Echo"],
  },
  {
    task: "Market reach expansion",
    best: ["Launch Vector", "Growth Atlas", "Audience Echo"],
  },
];

const dailyGeneration = [
  { label: "New robots", value: "+1000", tone: "good" },
  { label: "Accepted candidates", value: "78%", tone: "safe" },
  { label: "Rejected weak pool", value: "41%", tone: "warn" },
  { label: "Committee score", value: "96.4%", tone: "good" },
];

const promotionFlow = [
  { label: "Elite candidates", count: "Top 10", state: "visible" },
  { label: "Committee review", count: "50", state: "review" },
  { label: "Monitoring queue", count: "214", state: "monitor" },
  { label: "Weak bots hidden", count: "4,736", state: "hidden" },
];

export function RobotAdminDashboard() {
  const [topBots, setTopBots] = useState(fallbackTopBots);
  const [averageScore, setAverageScore] = useState(92);
  const [filteredOut, setFilteredOut] = useState(214);

  useEffect(() => {
    let active = true;

    fetch("/api/admin/dashboard")
      .then((response) => response.json())
      .then((payload) => {
        if (!active || !payload?.success || !payload.summary) return;

        const visible = (payload.summary.visibleRobots.slice(0, 10) as RobotApiRecord[]).map((robot) => ({
          id: robot.id.slice(0, 8).toUpperCase(),
          name: robot.name,
          team: "Platform",
          intelligence: Number(robot.intelligence ?? 0),
          skill: Number(robot.skill ?? 0),
          experience: Number(robot.experience ?? 0),
          status: robot.status === "HIDDEN" ? "Hidden" : robot.status === "REVIEW" ? "Review" : "Ready",
          fit: "Platform intelligence assignment",
        }));

        if (visible.length > 0) setTopBots(visible);
        setAverageScore(payload.summary.averageIntelligence ?? 92);
        setFilteredOut(payload.summary.hiddenRobots ?? 214);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="shell robot-admin-shell">
      <section className="robot-hero card">
        <div>
          <div className="kicker">ROBOT INTELLIGENCE</div>
          <h1>Owner Control Panel</h1>
          <p>
            The platform continuously evaluates the smartest robots, keeps the most
            skilled, and assigns them to the most suitable workstreams.
          </p>
        </div>
        <div className="owner-summary">
          <span className="pill">
            <span className="live-dot" />
            {topBots.length} active robots
          </span>
          <strong>Top {topBots.length} selected</strong>
          <small>New generation every 24h</small>
        </div>
      </section>

      <section className="stats-grid stats-grid--admin">
        <Card className="stat-card">
          <span className="stat-card__icon accent-1">
            <Icon name="sparkles" />
          </span>
          <div>
            <p>Top ranked</p>
            <strong>{topBots.length}</strong>
            <small>best robot performers</small>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__icon accent-2">
            <Icon name="brain" />
          </span>
          <div>
            <p>Average intelligence</p>
            <strong>{averageScore}%</strong>
            <small>global system score</small>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__icon accent-3">
            <Icon name="activity" />
          </span>
          <div>
            <p>Daily growth</p>
            <strong>+1000</strong>
            <small>new robots / 24h</small>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__icon accent-4">
            <Icon name="shield" />
          </span>
          <div>
            <p>Filtered out</p>
            <strong>{filteredOut}</strong>
            <small>low-performing robots</small>
          </div>
        </Card>
      </section>

      <section className="owner-grid">
        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Top 10 intelligent robots</h2>
            <span>Updated 24h</span>
          </header>
          <div className="rank-list">
            {topBots.map((bot, index) => (
              <div key={bot.id} className="rank-row">
                <div className="rank-badge">#{index + 1}</div>
                <div className="rank-info">
                  <strong>{bot.name}</strong>
                  <small>
                    {bot.team} · {bot.id} · {bot.status}
                  </small>
                </div>
                <div className="rank-metrics">
                  <span>{bot.intelligence}%</span>
                  <span>{bot.skill}%</span>
                  <span>{bot.experience}%</span>
                </div>
                <Link href={`/admin/robots/${bot.id.toLowerCase()}`} className="btn small primary">
                  Assign
                </Link>
              </div>
            ))}
          </div>
        </Card>

        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Team intelligence</h2>
            <span>Live</span>
          </header>
          <div className="team-summary">
            {teamSummary.map((team) => (
              <div key={team.label} className="team-row">
                <div>
                  <strong>{team.label}</strong>
                  <small>{team.trend}</small>
                </div>
                <b>{team.value}</b>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="owner-grid lower-grid">
        <Card className="owner-panel filter-panel">
          <header className="panel-header">
            <h2>Filtering logic</h2>
            <span>Auto-ranked</span>
          </header>
          <div className="filter-grid">
            {promotionFlow.map((stage) => (
              <div key={stage.label} className="filter-row">
                <div>
                  <strong>{stage.label}</strong>
                  <small>{stage.count}</small>
                </div>
                <span className={`status-badge ${stage.state}`}>{stage.state}</span>
              </div>
            ))}
          </div>
          <div className="filter-actions">
            <Link href="/admin/robots" className="btn primary">Full ranking</Link>
            <button className="btn ghost">Review weak pool</button>
          </div>
        </Card>

        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Top skill clusters</h2>
            <span>Learned by the core</span>
          </header>
          <div className="skill-cluster-list">
            <div className="skill-cluster">
              <span>Development</span>
              <div className="progress"><i style={{ width: "96%" }} /></div>
              <b>96%</b>
            </div>
            <div className="skill-cluster">
              <span>Innovation</span>
              <div className="progress"><i style={{ width: "94%" }} /></div>
              <b>94%</b>
            </div>
            <div className="skill-cluster">
              <span>Monitoring</span>
              <div className="progress"><i style={{ width: "92%" }} /></div>
              <b>92%</b>
            </div>
            <div className="skill-cluster">
              <span>Sales & growth</span>
              <div className="progress"><i style={{ width: "90%" }} /></div>
              <b>90%</b>
            </div>
          </div>
        </Card>
      </section>

      <section className="owner-grid lower-grid">
        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Committee 50</h2>
            <span>Assessment layer</span>
          </header>
          <div className="committee-list">
            {committeeMembers.map((member) => (
              <div key={member.name} className="committee-item">
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.role}</small>
                </div>
                <span>{member.score}%</span>
              </div>
            ))}
          </div>
          <div className="filter-actions committee-actions">
            <Link href="/admin/committee" className="btn primary">Open committee report</Link>
          </div>
        </Card>

        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Task selection</h2>
            <span>Best-fit robots</span>
          </header>
          <div className="task-selection-list">
            {missionAssignments.map((assignment) => (
              <div key={assignment.task} className="task-assignment">
                <strong>{assignment.task}</strong>
                <ul>
                  {assignment.best.map((bot) => (
                    <li key={bot}>{bot}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="owner-grid lower-grid">
        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Daily generation pulse</h2>
            <span>24h intelligence cycle</span>
          </header>
          <div className="generation-grid">
            {dailyGeneration.map((metric) => (
              <div key={metric.label} className={`metric-pill ${metric.tone}`}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        </Card>

        <Card className="owner-panel">
          <header className="panel-header">
            <h2>Owner insight</h2>
            <span>Decision summary</span>
          </header>
          <div className="insight-box">
            <strong>Current priority</strong>
            <p>Keep the top-performing robots visible, move the promising tier into committee review, and hide weak bots from the live operations panel.</p>
          </div>
          <div className="filter-actions committee-actions">
            <Link href="/admin/decisions" className="btn primary">Open final decision board</Link>
            <Link href="/admin/reports" className="btn ghost">Daily reports</Link>
          </div>
        </Card>
      </section>
    </main>
  );
}
