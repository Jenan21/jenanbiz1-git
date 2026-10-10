import { describe, expect, it } from "vitest";
import {
  PERSONALIZABLE_INTERFACE_ITEMS,
  PERSONALIZABLE_INTERFACE_PATHS,
  normalizeHiddenInterfacePaths,
} from "@/lib/account/interface-visibility";

describe("interface visibility catalog", () => {
  it("contains unique absolute paths while protecting account recovery routes", () => {
    const paths = PERSONALIZABLE_INTERFACE_ITEMS.map((item) => item.path);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths.every((path) => path.startsWith("/"))).toBe(true);
    expect(PERSONALIZABLE_INTERFACE_PATHS.has("/user")).toBe(false);
    expect(PERSONALIZABLE_INTERFACE_PATHS.has("/user/interface")).toBe(false);
    expect(PERSONALIZABLE_INTERFACE_PATHS.has("/account")).toBe(false);
  });

  it("normalizes persisted values against the allowlist", () => {
    expect(normalizeHiddenInterfacePaths([
      "/software",
      "/unknown",
      "/projects",
      "/software",
      42,
    ])).toEqual(["/projects", "/software"]);
    expect(normalizeHiddenInterfacePaths(null)).toEqual([]);
  });
});
