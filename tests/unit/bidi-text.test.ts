import { describe, expect, it } from "vitest";
import { detectDirection, layoutParagraph, mirrorBrackets, visualOrder } from "@/lib/pdf/bidi-text";

const measure = (word: string) => word.length * 5;

describe("PDF word order", () => {
  it("reads the paragraph direction from the first letter that has one", () => {
    expect(detectDirection("منصة قهوة")).toBe("rtl");
    expect(detectDirection("Coffee platform")).toBe("ltr");
    expect(detectDirection("12345", "rtl")).toBe("rtl");
    expect(detectDirection("(500) منصة")).toBe("rtl");
  });

  it("puts an Arabic line's words right to left and keeps digits and Latin words in their own order", () => {
    const placed = visualOrder(["رأس", "المال", "500,000", "ريال"], "rtl").map((item) => item.text);
    // Drawn left to right: the last Arabic word first, then the number whole, then the first words.
    expect(placed).toEqual(["ريال", "500,000", "المال", "رأس"]);
    const mixed = visualOrder(["قهوة", "Specialty", "Coffee", "مختصة"], "rtl").map((item) => item.text);
    expect(mixed).toEqual(["مختصة", "Specialty", "Coffee", "قهوة"]);
  });

  it("keeps an English line left to right and an Arabic phrase inside it intact", () => {
    expect(visualOrder(["Open", "the", "report"], "ltr").map((item) => item.text)).toEqual(["Open", "the", "report"]);
    expect(visualOrder(["City:", "حي", "النرجس"], "ltr").map((item) => item.text)).toEqual(["City:", "النرجس", "حي"]);
  });

  it("mirrors brackets inside right-to-left text only", () => {
    expect(mirrorBrackets("(الرياض)")).toBe(")الرياض(");
    expect(visualOrder(["(الرياض)"], "rtl")[0]!.text).toBe(")الرياض(");
    expect(visualOrder(["(Riyadh)"], "rtl")[0]!.text).toBe("(Riyadh)");
  });

  it("joins a lone mark between two words of one direction to them", () => {
    expect(visualOrder(["قهوة", "-", "شاي"], "rtl").map((item) => item.text)).toEqual(["شاي", "-", "قهوة"]);
  });

  it("wraps to the box width without ever returning a line wider than it, and cuts a word that cannot fit", () => {
    const text = "منصة توصيل قهوة مختصة للمكاتب والشركات الناشئة في شمال الرياض";
    const lines = layoutParagraph(text, { base: "rtl", maxWidth: 80, measure, space: 3 });
    expect(lines.length).toBeGreaterThan(2);
    for (const line of lines) expect(line.width).toBeLessThanOrEqual(80);
    const cut = layoutParagraph("a".repeat(60), { base: "ltr", maxWidth: 50, measure, space: 3 });
    expect(cut.length).toBeGreaterThan(1);
    for (const line of cut) expect(line.width).toBeLessThanOrEqual(50);
    expect(layoutParagraph("one\n\ntwo", { base: "ltr", maxWidth: 200, measure, space: 3 })).toHaveLength(3);
  });
});
