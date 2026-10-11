import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDocumentStorage } from "@/lib/storage/document-storage";

describe("document storage selection", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses local storage outside Vercel", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("BLOB_STORE_ID", "store_example");
    expect(resolveDocumentStorage().name).toBe("local-document-storage");
  });

  it("uses private Vercel Blob storage in a linked deployment", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BLOB_STORE_ID", "store_example");
    expect(resolveDocumentStorage().name).toBe("vercel-blob-document-storage");
  });
});
