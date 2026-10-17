import { describe, expect, it } from "vitest";
import { readDataCenterBody, readDataCenterJson } from "../../lib/admin/data-center-http";
import { DATA_CENTER_AREAS, dataCenterPath, isDataCenterArea } from "../../lib/admin/data-center-routes";

describe("data center HTTP boundaries", () => {
  it("rejects oversized declared and actual bodies", async () => {
    await expect(readDataCenterBody(new Request("https://jenan.test", {
      method: "POST", body: "x", headers: { "content-length": "100" },
    }), 10)).rejects.toMatchObject({ status: 413 });
    await expect(readDataCenterBody(new Request("https://jenan.test", {
      method: "POST", body: "a".repeat(11),
    }), 10)).rejects.toMatchObject({ status: 413 });
  });

  it("accepts bounded JSON and rejects unsupported or malformed payloads", async () => {
    const request = (body: string, type = "application/json") => new Request("https://jenan.test", {
      method: "POST", body, headers: { "content-type": type },
    });
    await expect(readDataCenterJson(request('{"action":"create"}'))).resolves.toEqual({ action: "create" });
    await expect(readDataCenterJson(request("{"))).rejects.toMatchObject({ status: 400 });
    await expect(readDataCenterJson(request("{}", "text/html"))).rejects.toMatchObject({ status: 415 });
  });

  it("registers all fifteen distinct admin pages without arbitrary routes", () => {
    expect(DATA_CENTER_AREAS).toHaveLength(15);
    expect(new Set(DATA_CENTER_AREAS.map((area) => dataCenterPath(area.key))).size).toBe(15);
    expect(dataCenterPath("overview")).toBe("/admin/data-center");
    expect(isDataCenterArea("knowledge")).toBe(true);
    expect(isDataCenterArea("../users")).toBe(false);
  });
});
