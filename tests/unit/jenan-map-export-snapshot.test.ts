import { expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/lib/db", () => ({ db: { $queryRaw: mocks.query } }));
vi.mock("@/services/jenan-map/storage", () => ({
  downloadMetadata: () => ({ filename: "tiles.pmtiles", mime: "application/vnd.pmtiles" }),
  storageState: async () => ({ status: "available", configured: true }),
}));
import { snapshot } from "@/services/jenan-map/service";
import { canDownloadMapArtifact } from "@/components/admin/jenan-map/snapshot";

it("preserves explicit export license evidence through the real admin snapshot projection", async () => {
  mocks.query
    .mockResolvedValueOnce([{ status: "disabled", revision: 0, publishedReleaseId: null }])
    .mockResolvedValueOnce([]).mockResolvedValueOnce([])
    .mockResolvedValueOnce([{
      id: "00000000-0000-4000-8000-000000000001",
      releaseId: "00000000-0000-4000-8000-000000000002",
      kind: "pmtiles", filename: "tiles.pmtiles", sha256: "a".repeat(64), byteSize: BigInt(127),
      publicSafe: true, exportAllowed: true, exportLicense: "Reviewed source export permission",
    }]);
  const result = await snapshot();
  expect(result.capabilities).toContain("layer-bind");
  expect(result.artifacts[0].exportLicense).toBe("Reviewed source export permission");
  expect(canDownloadMapArtifact(result.artifacts[0])).toBe(true);
});
