"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icons";
import { Modal } from "@/components/ui/modal";

interface DashboardContentProps {
  copy: {
    eyebrow: string;
    title: string;
    subtitle: string;
    action: string;
    modalTitle: string;
    modalBody: string;
    close: string;
    stats: Array<{
      label: string;
      value: string;
      note: string;
      icon: IconName;
    }>;
    activityTitle: string;
    activityEmpty: string;
    quickTitle: string;
    quickItems: string[];
  };
}

export function DashboardContent({ copy }: DashboardContentProps) {
  const [modalOpen, setModalOpen] = useState(false);
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">
            <Icon name="sparkles" />
            {copy.eyebrow}
          </p>
          <h1>{copy.title}</h1>
          <p>{copy.subtitle}</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Icon name="plus" />
          {copy.action}
        </Button>
      </section>
      <section className="stats-grid">
        {copy.stats.map((stat, index) => (
          <Card className="stat-card" key={stat.label}>
            <span className={`stat-card__icon accent-${index + 1}`}>
              <Icon name={stat.icon} />
            </span>
            <div>
              <p>{stat.label}</p>
              <strong>{stat.value}</strong>
              <small>{stat.note}</small>
            </div>
          </Card>
        ))}
      </section>
      <section className="dashboard-grid">
        <Card className="activity-card">
          <header>
            <div>
              <h2>{copy.activityTitle}</h2>
              <span className="live-badge">
                <i />
                Live
              </span>
            </div>
            <button aria-label="More">•••</button>
          </header>
          <div className="empty-state">
            <span>
              <Icon name="activity" />
            </span>
            <p>{copy.activityEmpty}</p>
          </div>
        </Card>
        <Card className="quick-card">
          <h2>{copy.quickTitle}</h2>
          <div>
            {copy.quickItems.map((item, index) => (
              <button key={item}>
                <span>
                  <Icon
                    name={
                      (["briefcase", "people", "wallet"] as IconName[])[
                        index
                      ] ?? "sparkles"
                    }
                  />
                </span>
                {item}
                <Icon name="chevron" />
              </button>
            ))}
          </div>
        </Card>
      </section>
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={copy.modalTitle}
      >
        <p className="modal-copy">{copy.modalBody}</p>
        <Button onClick={() => setModalOpen(false)}>{copy.close}</Button>
      </Modal>
    </>
  );
}
