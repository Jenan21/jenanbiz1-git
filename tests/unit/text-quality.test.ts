import { describe, expect, it } from "vitest";
import { nameProblem, problemFromIssue, textProblem, textProblemBilingualMessage, textQualityIssue } from "@/lib/projects/text-quality";

describe("text quality for project ideas", () => {
  it("rejects the exact text from the reported screenshot and other laughing or repeated input", () => {
    for (const value of ["هههههههههههه", "ههههه ههههه ههههه", "هاهاهاهاها", "aaaaaaaa", "lollllll lolllll", "ممممممممم ممممم", "ههه هههه ههههه ههههه"]) {
      expect(textProblem(value), value).not.toBeNull();
    }
    expect(textProblem("هههههههههههه")).toBe("TOO_FEW_WORDS");
  });

  it("rejects keyboard mashing in Latin and Arabic", () => {
    expect(textProblem("asdfghjkl qwertyuiop")).toBe("KEYBOARD_MASH");
    expect(textProblem("zxcvbnm lkjhgfdsa")).toBe("KEYBOARD_MASH");
    expect(textProblem("ضصثقفغ شسيبلات")).toBe("KEYBOARD_MASH");
  });

  it("rejects repeated words and text with almost no variety", () => {
    expect(textProblem("test test test test")).toBe("REPEATED_WORDS");
    expect(textProblem("ababab ababab abab")).toBe("LOW_VARIETY");
  });

  it("rejects text that is too short to be an idea", () => {
    expect(textProblem("")).toBe("TOO_FEW_LETTERS");
    expect(textProblem("مطعم")).toBe("TOO_FEW_LETTERS");
    expect(textProblem("a b c d e f g h")).toBe("TOO_FEW_WORDS");
  });

  it("accepts ordinary ideas in Arabic and English, with marks and punctuation", () => {
    for (const value of [
      "منصة رقمية لتوصيل المنتجات الصحية",
      "مطعم وجبات صحية سريعة",
      "تطبيق توصيل",
      "مَنَصَّةٌ لِتَوْصِيلِ الطَّلَبَاتِ",
      "A documented cold-chain marketplace for regional operators.",
      "An editor-reviewed cold-chain marketplace for regional operators.",
      "Healthy food delivery platform for busy families",
      "Used-car inspection app, 24/7 support",
      "متجر إلكتروني للقهوة المختصة والمعدات",
      "لا تنمو الشركات بدون عملاء ولا تنجح بدون خطة",
      "Coffee roastery wooow brand",
    ]) {
      expect(textProblem(value), value).toBeNull();
    }
  });

  it("does not match a keyboard row across a space between two real words", () => {
    expect(textProblem("لا تنمو الشركات")).toBeNull();
  });

  it("applies a lighter rule to names", () => {
    expect(nameProblem("Solar")).toBeNull();
    expect(nameProblem("Mama Mia")).toBeNull();
    expect(nameProblem("Add lead")).toBeNull();
    expect(nameProblem("E2E route composition project")).toBeNull();
    expect(nameProblem("جنان")).toBeNull();
    expect(nameProblem("هههههههههههه")).toBe("REPEATED_LETTERS");
    expect(nameProblem("aaaaaaaa")).toBe("REPEATED_LETTERS");
    expect(nameProblem("x")).toBe("TOO_FEW_LETTERS");
  });

  it("carries the problem through a schema issue and gives both languages", () => {
    expect(problemFromIssue(textQualityIssue("REPEATED_LETTERS"))).toBe("REPEATED_LETTERS");
    expect(problemFromIssue("Required")).toBeNull();
    expect(problemFromIssue("TEXT_QUALITY:NOPE")).toBeNull();
    const message = textProblemBilingualMessage("REPEATED_LETTERS");
    expect(message).toMatch(/[\u0600-\u06ff]/);
    expect(message).toContain("repeats letters");
  });
});
