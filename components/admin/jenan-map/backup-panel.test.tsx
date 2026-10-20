import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { backupErrorMessage, backupProblemLabel, MapBackupPanel, readBackupListing, readBackupVerdict } from "./backup-panel";

describe("backup panel server contract", () => {
  it("reads a listing only when the server really answered with one", () => {
    expect(readBackupListing({ configured: false, backups: [] })).toEqual({ configured: false, backups: [] });
    expect(readBackupListing({ configured: true, backups: [{ folder: "jenan-map-1", modifiedAt: "2026-10-18T10:00:00.000Z" }] })?.backups).toHaveLength(1);
    for (const bad of [null, {}, { configured: "yes", backups: [] }, { configured: true }, { configured: true, backups: [{ folder: 1 }] }, { error: "MAP_UNAVAILABLE" }]) {
      expect(readBackupListing(bad)).toBeNull();
    }
  });
  it("reads a verdict with its problems", () => {
    expect(readBackupVerdict({ folder: "f", ok: false, problems: [{ code: "ARTIFACT_MISSING", detail: "pmtiles x" }], mapVersion: "v1", dataVersion: "d" }))
      .toEqual({ folder: "f", ok: false, problems: [{ code: "ARTIFACT_MISSING", detail: "pmtiles x" }], mapVersion: "v1" });
    expect(readBackupVerdict({ folder: "f", ok: true })).toBeNull();
    expect(readBackupVerdict({ folder: "f", ok: true, problems: [], mapVersion: 3 })?.mapVersion).toBeNull();
  });
  it("explains every validation problem in Arabic and never shows a raw code to the administrator", () => {
    expect(backupProblemLabel("ARTIFACT_CHECKSUM_MISMATCH")).toContain("بصمة");
    expect(backupProblemLabel("SOMETHING_NEW")).toBe("مشكلة غير معروفة في النسخة");
  });
  it("maps backup errors to plain guidance, including a server without a backup folder (status 503)", () => {
    expect(backupErrorMessage("BACKUP_ROOT_NOT_CONFIGURED", 503)).toContain("JENAN_MAP_BACKUP_ROOT");
    expect(backupErrorMessage("PRIVATE_BACKUP_ROOT_REQUIRED", 503)).toContain("خاصاً");
    expect(backupErrorMessage("BACKUP_NOT_RESTORABLE", 422)).toContain("لا يمكن استعادتها");
    expect(backupErrorMessage("BACKUP_FEATURES_OUTSIDE_BOUNDARY", 422)).toContain("لم يتغير الإنتاج");
    expect(backupErrorMessage("ADMIN_REQUIRED", 403)).toContain("صلاحية");
  });
});

describe("backup panel before the server has answered", () => {
  const html = renderToStaticMarkup(<MapBackupPanel snapshot={null} disabled={false} onSettled={() => undefined} />);
  it("states the safe restore path and claims nothing about existing backups", () => {
    expect(html).toContain("نسخة احتياطية كاملة");
    expect(html).toContain("لا تكتب على الإنتاج أبداً");
    expect(html).toContain("حالة النسخ الاحتياطية غير معروفة");
    expect(html).not.toContain("سليمة وكاملة");
  });
  it("keeps every action disabled until the server answers", () => {
    expect(html).toMatch(/<button[^>]*disabled[^>]*>إنشاء نسخة احتياطية كاملة/);
    expect(html).toMatch(/<select[^>]*disabled/);
  });
});
