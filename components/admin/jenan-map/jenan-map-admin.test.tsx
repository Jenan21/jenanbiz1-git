import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { JenanMapAdmin } from "./jenan-map-admin";
import { mapAdminSections } from "./sections";
import { MapActionConfirmation } from "./confirmation";

describe("Jenan PRO Map isolated admin surfaces", () => {
  it.each(mapAdminSections)("renders the %s section without requiring a live database", (section, label) => {
    const html = renderToStaticMarkup(<JenanMapAdmin section={section} />);
    expect(html).toContain(label);
    expect(html).toContain('dir="rtl"');
    expect(html).toContain("لا توجد مجموعة بيانات سعودية فعلية");
    expect(html).not.toContain("healthy");
    expect(html).not.toContain("تم النشر بنجاح");
  });

  it("does not claim a zero count or known operational status while unavailable", () => {
    const html = renderToStaticMarkup(<JenanMapAdmin section="overview" />);
    expect(html).toContain("غير معروفة");
    expect(html).not.toContain('jenan-map-admin__metric">0');
    expect(html).not.toContain("مهيأ —");
  });

  it("keeps staging and runtime mutation controls disabled before backend capabilities load", () => {
    const updates = renderToStaticMarkup(<JenanMapAdmin section="updates" />);
    const settings = renderToStaticMarkup(<JenanMapAdmin section="settings" />);
    expect(updates).toContain("إنشاء المسودة غير متاح من الخادم");
    expect(updates).toMatch(/type="submit"[^>]*disabled/);
    expect(settings).toContain("إجراء إعدادات التشغيل غير متاح من الخادم");
    expect(settings).toMatch(/type="submit"[^>]*disabled/);
  });

  it("requires explicit acknowledgment and a reason while displaying the expected pointer", () => {
    const html = renderToStaticMarkup(<MapActionConfirmation
      pending={{ action: "publish", title: "نشر", description: "استبدال مؤشر الإنتاج", versionId: "new-release" }}
      revision={7}
      publishedReleaseId="current-release"
      busy={false}
      onCancel={() => undefined}
      onConfirm={() => undefined}
    />);
    expect(html).toContain("current-release");
    expect(html).toContain("new-release");
    expect(html).toContain("مراجعة الحالة المتوقعة");
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('minLength="8"');
    expect(html).toMatch(/disabled="">تأكيد الإجراء/);
  });
});
