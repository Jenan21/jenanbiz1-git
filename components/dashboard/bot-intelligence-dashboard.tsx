import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";

const skillPool = [
  { skill: "Product Innovation", score: 96, bots: 6 },
  { skill: "Sales Psychology", score: 91, bots: 5 },
  { skill: "Growth Loops", score: 88, bots: 5 },
  { skill: "Automation Design", score: 94, bots: 7 },
  { skill: "Audience Targeting", score: 89, bots: 4 },
  { skill: "Community Trust", score: 86, bots: 3 },
];

const robotProfiles = [
  {
    name: "Dev Forge AI",
    type: "Developer Robot",
    status: "Live Learning",
    maturity: 94,
    inherited: ["Product Innovation", "Automation Design", "System Thinking"],
    focus: "Builds clean product systems and release flows.",
  },
  {
    name: "Lead Signal X",
    type: "Growth Robot",
    status: "Cross-Channel",
    maturity: 90,
    inherited: ["Growth Loops", "Audience Targeting", "Content Execution"],
    focus: "Finds the best conversion tactics from previous winners.",
  },
  {
    name: "Deal Whisper",
    type: "Sales Robot",
    status: "Active Prospecting",
    maturity: 92,
    inherited: ["Sales Psychology", "Trust Building", "Offer Positioning"],
    focus: "Applies proven sales scripts and conversion flows.",
  },
  {
    name: "Community Pulse",
    type: "Engagement Robot",
    status: "Audience Sync",
    maturity: 87,
    inherited: ["Community Trust", "Persona Mapping", "Retention Strategy"],
    focus: "Retains attention and transforms users into advocates.",
  },
];

const knowledgeFeed = [
  {
    title: "Dev Forge AI inherited automation patterns from 3 previous bots",
    time: "Just now",
    value: "+14 knowledge points",
  },
  {
    title: "Deal Whisper copied conversion tactics from the highest converting sales robots",
    time: "12 min ago",
    value: "+9 conversion logic",
  },
  {
    title: "Lead Signal X spread audience targeting loops to the new growth cluster",
    time: "27 min ago",
    value: "+7 reach efficiency",
  },
  {
    title: "Community Pulse unlocked trust-building playbooks from senior engagement agents",
    time: "1 hour ago",
    value: "+11 trust score",
  },
];

export function BotIntelligenceDashboard() {
  return (
    <main className="shell robot-dashboard">
      <section className="robot-hero card">
        <div>
          <div className="kicker">ROBOT INTELLIGENCE CORE</div>
          <h1>Jenan Robot Knowledge Hub</h1>
          <p>
            Every new bot inherits proven capabilities, execution patterns, and
            strategic memory from the robot lineage before it.
          </p>
        </div>
        <div className="robot-hero__stats">
          <span className="pill"><span className="live-dot" /> Active knowledge sync</span>
          <strong>27 robots</strong>
          <small>11 shared skill clusters</small>
        </div>
      </section>

      <section className="stats-grid stats-grid--admin">
        <Card className="stat-card">
          <span className="stat-card__icon accent-1">
            <Icon name="sparkles" />
          </span>
          <div>
            <p>Total skill nodes</p>
            <strong>1,284</strong>
            <small>+18 this week</small>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__icon accent-2">
            <Icon name="brain" />
          </span>
          <div>
            <p>Shared intelligence</p>
            <strong>89%</strong>
            <small>reused across bots</small>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__icon accent-3">
            <Icon name="activity" />
          </span>
          <div>
            <p>Live inheritance</p>
            <strong>4.2x</strong>
            <small>faster onboarding</small>
          </div>
        </Card>
        <Card className="stat-card">
          <span className="stat-card__icon accent-4">
            <Icon name="shield" />
          </span>
          <div>
            <p>Risk coverage</p>
            <strong>96%</strong>
            <small>proven playbooks</small>
          </div>
        </Card>
      </section>

      <section className="robot-grid">
        <Card className="robot-panel">
          <header>
            <h2>Skill inheritance map</h2>
            <span>Live cluster</span>
          </header>
          <div className="skill-list">
            {skillPool.map((item) => (
              <div key={item.skill} className="skill-row">
                <div className="skill-row__meta">
                  <strong>{item.skill}</strong>
                  <small>{item.bots} bots using it</small>
                </div>
                <div className="track">
                  <span style={{ width: `${item.score}%` }} />
                </div>
                <b>{item.score}%</b>
              </div>
            ))}
          </div>
        </Card>

        <Card className="robot-panel">
          <header>
            <h2>Knowledge feed</h2>
            <span>Recent syncs</span>
          </header>
          <div className="feed-list">
            {knowledgeFeed.map((item) => (
              <div key={item.title} className="feed-item">
                <div className="feed-item__dot" />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.time}</small>
                </div>
                <span>{item.value}</span>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="bot-card-grid">
        {robotProfiles.map((bot) => (
          <Card key={bot.name} className="bot-identity-card">
            <div className="bot-header">
              <div>
                <span className="bot-type">{bot.type}</span>
                <h3>{bot.name}</h3>
              </div>
              <span className="status-tag">{bot.status}</span>
            </div>
            <p>{bot.focus}</p>
            <div className="maturity-box">
              <label>Maturity</label>
              <div className="track small">
                <span style={{ width: `${bot.maturity}%` }} />
              </div>
              <strong>{bot.maturity}%</strong>
            </div>
            <div className="inherited-tags">
              {bot.inherited.map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          </Card>
        ))}
      </section>
    </main>
  );
}
