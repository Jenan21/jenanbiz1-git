import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: () => undefined }), usePathname: () => "/projects" }));
vi.mock("@/components/auth/logout-button", () => ({
  LogoutButton: ({ label }: { label: string }) => createElement("button", { className: "logout-button", type: "button" }, label),
}));
vi.mock("@/components/ui/language-switcher", () => ({
  LanguageSwitcher: () => createElement("button", { className: "language-switcher", type: "button" }, "EN"),
}));
vi.mock("@/components/projects/project-invitations", () => ({ HubProjectInvitations: () => null }));

import { ProjectsHub, type HubProject } from "@/components/projects/projects-hub";

const project = (index: number, status: string): HubProject => ({
  id: `p${index}`,
  name: `Project ${index}`,
  status,
  currentPhase: "ANALYSIS",
  sector: null,
  updatedAt: new Date("2026-10-01T10:00:00Z"),
});

function render(projects: HubProject[], locale: "ar" | "en" = "en") {
  return renderToStaticMarkup(createElement(ProjectsHub, { locale, projects, userLabel: "Jane" }));
}

describe("projects section", () => {
  it("keeps the markers the route checks and the three project services as direct links", () => {
    const html = render([]);
    expect(html).toContain('data-projects-route="/projects"');
    expect(html).toContain('data-projects-source="ACCOUNT_PROJECT_RECORDS"');
    const services = html.slice(html.indexOf("projects-stage__services"), html.indexOf("projects-stage__recent"));
    expect([...services.matchAll(/<a href="([^"]+)" class="stage-card /g)].map((match) => match[1])).toEqual(["/projects/analysis", "/projects/start", "/projects/feasibility"]);
  });

  it("uses the shared header and the platform's stage, with the same watermark treatment as the home", () => {
    const html = render([]);
    expect(html).toContain('data-testid="jenan-header"');
    expect(html).toContain("stage__photo");
    expect(html.match(/stage-card__photo/g)).toHaveLength(3);
    expect(html.match(/stage-card__watermark/g)).toHaveLength(3);
  });

  it("counts only the account's own records and shows an honest empty state", () => {
    const empty = render([]);
    expect(empty.match(/class="stage-glass"/g)).toHaveLength(4);
    expect(empty).toContain("No projects yet");
    const html = render([project(1, "COMPLETED"), project(2, "IN_PROGRESS"), project(3, "DRAFT"), project(4, "IN_PROGRESS")]);
    const values = [...html.matchAll(/<strong>(\d+)<\/strong><em>Live records<\/em>/g)].map((match) => Number(match[1]));
    expect(values).toEqual([4, 3, 2, 1]);
    expect(html).not.toContain("No projects yet");
    expect(html).toContain("Project 1");
  });

  it("lists at most the three latest projects and invents no money or percentage", () => {
    const html = render(Array.from({ length: 9 }, (_, index) => project(index + 1, "DRAFT")), "ar");
    const recent = html.slice(html.indexOf("projects-stage__recent"));
    expect(recent.match(/<li>/g)).toHaveLength(3);
    const text = html.replace(/<[^>]*>/g, " ");
    expect(text).not.toMatch(/\d\s?%|SAR|ر\.س|\$/);
  });
});
