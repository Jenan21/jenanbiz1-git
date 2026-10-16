import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode } & Record<string, unknown>) => createElement("a", { href, ...rest }, children),
}));
vi.mock("next/image", () => ({ default: ({ src, alt }: { src: string; alt: string }) => createElement("img", { src, alt }) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ back: () => undefined, push: () => undefined }), usePathname: () => "/benefits" }));
vi.mock("@/components/auth/logout-button", () => ({ LogoutButton: () => createElement("button", { type: "button" }, "Logout") }));
vi.mock("@/components/ui/language-switcher", () => ({ LanguageSwitcher: () => createElement("button", { type: "button" }, "EN") }));

import { AboutPage } from "@/components/shell/about-page";
import { emptyPlatformProfile, normalizePlatformProfile, platformProfileSchema, profileText } from "@/lib/platform/platform-profile";

const filled = platformProfileSchema.parse({
  name: { ar: "جنان برو", en: "Jenan PRO" },
  summary: { ar: "منصة أعمال متكاملة", en: "An integrated business platform" },
  registration: { commercialRegister: "1010123456", establishedYear: "2024" },
  contacts: { phones: ["+966 50 123 4567"], emails: ["info@jenanpro.sa"], website: "https://jenanpro.sa", whatsapp: "+966501234567", address: { ar: "الرياض", en: "Riyadh" } },
  achievements: [{ title: { ar: "عملاء", en: "Clients" }, value: "+120", description: { ar: "", en: "" } }],
});

function render(profile = filled, locale: "ar" | "en" = "en", extra: Partial<Parameters<typeof AboutPage>[0]> = {}) {
  return renderToStaticMarkup(createElement(AboutPage, { canEdit: false, locale, profile, unavailable: false, updatedAt: new Date("2026-10-16T10:00:00Z"), userLabel: "Jane", ...extra }));
}

describe("platform profile", () => {
  it("accepts an empty profile and never invents values", () => {
    expect(emptyPlatformProfile.registration.commercialRegister).toBe("");
    expect(emptyPlatformProfile.achievements).toEqual([]);
  });

  it("rejects non-https websites, bad phones and bad years", () => {
    expect(platformProfileSchema.safeParse({ contacts: { website: "http://example.com" } }).success).toBe(false);
    expect(platformProfileSchema.safeParse({ contacts: { website: "javascript:alert(1)" } }).success).toBe(false);
    expect(platformProfileSchema.safeParse({ contacts: { phones: ["<script>"] } }).success).toBe(false);
    expect(platformProfileSchema.safeParse({ registration: { establishedYear: "24" } }).success).toBe(false);
    expect(platformProfileSchema.safeParse({ achievements: Array.from({ length: 9 }, () => ({})) }).success).toBe(false);
  });

  it("drops the blank rows the form leaves behind", () => {
    const parsed = platformProfileSchema.parse({ contacts: { emails: ["", "a@b.co"], phones: [""] }, achievements: [{}, { value: "5" }] });
    const normalized = normalizePlatformProfile(parsed);
    expect(normalized.contacts.emails).toEqual(["a@b.co"]);
    expect(normalized.contacts.phones).toEqual([]);
    expect(normalized.achievements).toHaveLength(1);
  });

  it("falls back to the other language when one is missing", () => {
    expect(profileText({ ar: "", en: "Only English" }, "ar")).toBe("Only English");
    expect(profileText({ ar: "عربي", en: "" }, "en")).toBe("عربي");
  });
});

describe("About page", () => {
  it("shows what was entered, with the logo as a watermark and working contact links", () => {
    const html = render();
    expect(html).toContain('data-about-route="/benefits"');
    expect(html).toContain("about__watermark");
    expect(html).toContain("jenan-pro-mark-large.webp");
    expect(html).toContain("1010123456");
    expect(html).toContain("+120");
    expect(html).toContain('href="mailto:info@jenanpro.sa"');
    expect(html).toContain('href="tel:+966501234567"');
    expect(html).toContain('href="https://wa.me/966501234567"');
  });

  it("says plainly that a missing field was not provided instead of inventing one", () => {
    const html = render(emptyPlatformProfile);
    expect(html).toContain("Not provided yet");
    expect(html).toContain("The platform team has not added its profile yet.");
    expect(html).toContain('data-about-source="ADMIN_ENTERED_PROFILE"');
    expect(render(emptyPlatformProfile, "en", { updatedAt: null })).toContain('data-about-source="NOT_PROVIDED"');
  });

  it("offers editing to administrators only, and reports a failed load", () => {
    expect(render()).not.toContain("/admin/platform-profile");
    expect(render(filled, "en", { canEdit: true })).toContain("/admin/platform-profile");
    expect(render(emptyPlatformProfile, "ar", { unavailable: true })).toContain("تعذر تحميل معلومات المنصة");
  });
});
