import { createServer } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { configuredDataCenterScanner } from "@/services/data-center/scanner";
afterEach(() => vi.unstubAllEnvs());
describe("Data Center ClamAV adapter", () => {
  it("does not invent availability when unconfigured", () => {
    vi.stubEnv("DATA_CENTER_CLAMAV_HOST", "");
    expect(configuredDataCenterScanner()).toBeUndefined();
  });
  it.each([["stream: OK\0", "CLEAN"], ["stream: Eicar-Test-Signature FOUND\0", "INFECTED"], ["stream: size limit ERROR\0", "UNAVAILABLE"]] as const)("handles scanner response %s", async (reply, expected) => {
    const chunks: Buffer[] = [];
    const server = createServer((socket) => {
      socket.on("data", (chunk) => {
        chunks.push(chunk);
        if (Buffer.concat(chunks).subarray(-4).equals(Buffer.alloc(4))) socket.end(reply);
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test scanner did not start");
    vi.stubEnv("DATA_CENTER_CLAMAV_HOST", "127.0.0.1");
    vi.stubEnv("DATA_CENTER_CLAMAV_PORT", String(address.port));
    try {
      expect(await configuredDataCenterScanner()!.scan(new TextEncoder().encode("test-data"))).toBe(expected);
      expect(Buffer.concat(chunks).subarray(0, 10).toString()).toBe("zINSTREAM\0");
    } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
  });
  it("fails closed on connection refusal", async () => {
    const server = createServer(); await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Test scanner did not start");
    await new Promise<void>((resolve) => server.close(() => resolve()));
    vi.stubEnv("DATA_CENTER_CLAMAV_HOST", "127.0.0.1"); vi.stubEnv("DATA_CENTER_CLAMAV_PORT", String(address.port));
    expect(await configuredDataCenterScanner()!.scan(new Uint8Array([1]))).toBe("UNAVAILABLE");
  });
});
