import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => undefined, refresh: () => undefined }) }));

import { LogoutButton } from "@/components/auth/logout-button";

describe("logout button", () => {
  it("renders the label and no failure message before anything was attempted", () => {
    const html = renderToStaticMarkup(createElement(LogoutButton, { label: "Logout" }));
    expect(html).toContain("Logout");
    expect(html).not.toContain("logout-error");
    expect(html).not.toContain('role="alert"');
  });
});
