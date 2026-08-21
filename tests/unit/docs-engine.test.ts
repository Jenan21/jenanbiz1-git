import { describe, expect, it } from "vitest";
import { parseDocx } from "@/packages/docs-engine/src";

describe("docs-engine", () => {
  it("throws on invalid docx payload", async () => {
    await expect(parseDocx(new Uint8Array([1, 2, 3, 4]))).rejects.toBeTruthy();
  });
});
