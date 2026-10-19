import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, NextResponse } from "next/server";

const mocks = vi.hoisted(() => ({ access: vi.fn(), command: vi.fn(), preverify: vi.fn() }));
vi.mock("@/services/jenan-map/http", () => ({
  access: mocks.access,
  json: (body: unknown, status = 200) => NextResponse.json(body, { status }),
  failure: (error: { code?: string; status?: number }) => NextResponse.json({ error: error.code ?? "FAILED" }, { status: error.status ?? 503 }),
}));
vi.mock("@/services/jenan-map/service", () => ({ command: mocks.command, preverifyCommand: mocks.preverify, snapshot: vi.fn(), overviewFacts: vi.fn() }));

import { POST } from "@/app/api/admin/jenan-map/route";

const releaseId = "1c1b5f07-9581-4e3b-a0a3-9fc7ea08ead1";
const approve = { action: "approve", releaseId, reason: "Human review confirmed", confirmation: "APPROVE" };
const post = (body: unknown) => new NextRequest("https://jenanpro.sa/api/admin/jenan-map", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "session-admin" } });
});

describe("admin map command route", () => {
  it("verifies the stored artifacts before the command's transaction and hands the result to it", async () => {
    const order: string[] = [];
    const verified = { releaseId, fingerprint: "f".repeat(64), style: { layers: [] } };
    mocks.preverify.mockImplementation(async () => { order.push("verify"); return verified; });
    mocks.command.mockImplementation(async () => { order.push("command"); return { id: releaseId, action: "approve", revision: 4 }; });
    const response = await POST(post(approve));
    expect(response.status).toBe(200);
    expect(order).toEqual(["verify", "command"]);
    expect(mocks.preverify).toHaveBeenCalledWith(expect.objectContaining({ action: "approve", releaseId }));
    expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ action: "approve" }), "session-admin", verified);
  });

  it("still runs commands that need no verification, and answers 201 for a created release", async () => {
    mocks.preverify.mockResolvedValue(undefined);
    mocks.command.mockResolvedValue({ id: releaseId, status: "Draft" });
    const response = await POST(post({ action: "create", version: "v2", source: "Protomaps", sourceDate: "2026-10-01T00:00:00Z", license: "ODbL-1.0" }));
    expect(response.status).toBe(201);
    expect(mocks.command).toHaveBeenCalledWith(expect.objectContaining({ action: "create" }), "session-admin", undefined);
  });

  it("reads and verifies nothing for an invalid command or without administrator access", async () => {
    expect((await POST(post({ action: "approve" }))).status).toBe(400);
    mocks.access.mockResolvedValue({ response: NextResponse.json({}, { status: 403 }) });
    expect((await POST(post(approve))).status).toBe(403);
    expect(mocks.preverify).not.toHaveBeenCalled();
    expect(mocks.command).not.toHaveBeenCalled();
  });

  it("refuses with the verification's own error, without opening the command, when an artifact fails", async () => {
    mocks.preverify.mockRejectedValue(Object.assign(new Error("ARTIFACT_INTEGRITY_FAILED"), { code: "ARTIFACT_INTEGRITY_FAILED", status: 503 }));
    const response = await POST(post(approve));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "ARTIFACT_INTEGRITY_FAILED" });
    expect(mocks.command).not.toHaveBeenCalled();
  });
});
