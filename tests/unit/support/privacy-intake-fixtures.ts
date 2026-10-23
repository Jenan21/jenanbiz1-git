import { createCipheriv, createDecipheriv, createHmac, randomBytes } from "node:crypto";
import { crc32 } from "@/services/privacy-gateway/intake/archive";
import {
  type Ciphertext, type IntakeRuntime, type KeyBoundary, type ScanBoundary, type ScanVerdict, type StagingStorage,
} from "@/services/privacy-gateway/intake/contracts";
import { privacyFixture, privacyId, privacyNow } from "./privacy-gateway-fixtures";

export const csv = (text = "category,amount\nrent,100\n") => new TextEncoder().encode(text);
export type ZipSpec = { name: string; bytes?: Uint8Array; flags?: number; method?: number; mode?: number;
  declaredSize?: number; extra?: Uint8Array; attributes?: number };
export function storedZip(entries: ZipSpec[]): Uint8Array {
  const local: Buffer[] = []; const central: Buffer[] = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const bytes = Buffer.from(entry.bytes ?? csv());
    const extra = Buffer.from(entry.extra ?? []); const crc = crc32(bytes);
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4); header.writeUInt16LE(entry.flags ?? 0, 6); header.writeUInt16LE(entry.method ?? 0, 8);
    header.writeUInt32LE(crc, 14); header.writeUInt32LE(bytes.length, 18); header.writeUInt32LE(entry.declaredSize ?? bytes.length, 22);
    header.writeUInt16LE(name.length, 26); header.writeUInt16LE(extra.length, 28);
    local.push(header, name, extra, bytes);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(0x0314, 4); record.writeUInt16LE(20, 6);
    record.writeUInt16LE(entry.flags ?? 0, 8); record.writeUInt16LE(entry.method ?? 0, 10);
    record.writeUInt32LE(crc, 16); record.writeUInt32LE(bytes.length, 20); record.writeUInt32LE(entry.declaredSize ?? bytes.length, 24);
    record.writeUInt16LE(name.length, 28); record.writeUInt16LE(extra.length, 30);
    record.writeUInt32LE(((entry.mode ?? 0x81a4) * 65536 + (entry.attributes ?? 0)) >>> 0, 38);
    record.writeUInt32LE(offset, 42); central.push(record, name, extra); offset += header.length + name.length + extra.length + bytes.length;
  }
  const directory = Buffer.concat(central); const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, directory, end]);
}
export function intakeFixture() {
  const f = privacyFixture(); f.job.rawInventoryCount = 0; f.job.rawInventoryHash = "0".repeat(64);
  let serial = 2000; let now = privacyNow; let allowed = true;
  const actor = f.actor(10); const grants = f.grants(actor, "INTAKE", "KEY_ACCESS");
  const material = new Map<string, Buffer>(); const encrypted = new Map<string, Ciphertext>();
  const cleanup: Parameters<IntakeRuntime["enqueueCleanup"]>[0][] = [];
  const expiry: Parameters<IntakeRuntime["scheduleExpiry"]>[0][] = [];
  const keys: KeyBoundary = {
    qualification: "TEST_ONLY",
    async create() { const id = privacyId(serial++); material.set(id, randomBytes(32)); return id; },
    async seal(handle, bytes, binding) {
      const key = material.get(handle); if (!key) throw new Error("synthetic key unavailable");
      const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, nonce); cipher.setAAD(binding);
      return { nonce, body: Buffer.concat([cipher.update(bytes), cipher.final()]), tag: cipher.getAuthTag() };
    },
    async open(handle, envelope, binding) {
      const key = material.get(handle); if (!key) throw new Error("synthetic key unavailable");
      const decipher = createDecipheriv("aes-256-gcm", key, envelope.nonce); decipher.setAAD(binding); decipher.setAuthTag(Buffer.from(envelope.tag));
      return Buffer.concat([decipher.update(envelope.body), decipher.final()]);
    },
    async fingerprint(handle, bytes) {
      const key = material.get(handle); if (!key) throw new Error("synthetic key unavailable");
      return createHmac("sha256", key).update(bytes).digest("hex");
    },
    async revoke(handle) { material.get(handle)?.fill(0); material.delete(handle); },
  };
  const storage: StagingStorage = {
    qualification: "TEST_ONLY",
    async putOpaque(key, envelope) {
      if (encrypted.has(key)) throw new Error("synthetic collision");
      encrypted.set(key, { nonce: Uint8Array.from(envelope.nonce), body: Uint8Array.from(envelope.body), tag: Uint8Array.from(envelope.tag) });
    },
    async getOpaque(key) { const value = encrypted.get(key); if (!value) throw new Error("synthetic absent"); return value; },
    async deleteOpaque(key) { encrypted.delete(key); },
  };
  let verdict: ScanVerdict = "CLEAN";
  const scanner: ScanBoundary = { qualification: "TEST_ONLY", async scan() { return verdict; } };
  const runtime: IntakeRuntime = {
    now: () => now, id: () => privacyId(serial++),
    async currentAuthorization() { return { actor: { ...actor, active: allowed }, grants }; },
    async scheduleExpiry(event) { expiry.push(event); },
    async enqueueCleanup(event) { cleanup.push(event); },
  };
  return { ...f, actor, grants, keys, storage, scanner, runtime, material, encrypted, cleanup, expiry,
    setNow: (value: string) => { now = value; }, revoke: () => { allowed = false; },
    setVerdict: (value: ScanVerdict) => { verdict = value; },
  };
}
