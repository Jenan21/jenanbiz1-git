import { createCipheriv, createDecipheriv, generateKeyPairSync, randomBytes, sign, verify, createPrivateKey } from "node:crypto";
import { link, mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { RecoveryObjects, InventoryArtifact } from "@/services/privacy-gateway/durable/recovery-contracts";
import type { ReceiptSigner } from "@/services/privacy-gateway/sanitization/contracts";
import { DurablePrivacyError } from "@/services/privacy-gateway/durable/contracts";
import { opaqueIdSchema } from "@/services/privacy-gateway/contracts";
import { privacyHash } from "@/services/privacy-gateway/policy";

const absent = (error: unknown) => error instanceof Error && "code" in error && error.code === "ENOENT";
async function optional(path: string): Promise<Buffer | null> {
  try { return await readFile(path); } catch (error) { if (absent(error)) return null; throw error; }
}
async function persisted(path: string) {
  return await optional(path) ?? await optional(`${path}.pending`);
}
async function remove(path: string) {
  try { await unlink(path); } catch (error) { if (!absent(error)) throw error; }
}
async function once(path: string, bytes: Uint8Array, checkpoint: () => Promise<void> = async () => {}) {
  // A single well-known pending path is covered by inventory cleanup, including process death.
  const pending = `${path}.pending`;
  try { await writeFile(pending, bytes, { flag: "wx", mode: 0o600 }); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
    const old = await readFile(pending);
    if (!old.equals(Buffer.from(bytes))) throw new DurablePrivacyError("HASH_MISMATCH");
  }
  await checkpoint();
  try { await link(pending, path); }
  catch (error) {
    if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
  }
  await remove(pending);
}
function seal(key: Buffer, bytes: Uint8Array, binding: string) {
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(binding));
  return Buffer.concat([iv, cipher.update(bytes), cipher.final(), cipher.getAuthTag()]);
}
function open(key: Buffer, bytes: Buffer, binding: string) {
  const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
  cipher.setAAD(Buffer.from(binding)); cipher.setAuthTag(bytes.subarray(-16));
  return Buffer.concat([cipher.update(bytes.subarray(12, -16)), cipher.final()]);
}
/** Restart-persistent synthetic configuration only; not a production key broker/storage qualification. */
export class RestartObjects implements RecoveryObjects {
  readonly qualification = "TEST_ONLY" as const;
  constructor(readonly root: string, private readonly checkpoint: (point: string) => Promise<void> = async () => {}) {}
  private path(jobId: string, ref: string, kind: string) {
    opaqueIdSchema.parse(jobId); opaqueIdSchema.parse(ref);
    return join(this.root, jobId, `${ref}.${kind}`);
  }
  private async master() {
    const key = await optional(join(this.root, "master.test-key"));
    if (!key || key.length !== 32) throw new DurablePrivacyError("ADAPTER_UNAVAILABLE");
    return key;
  }
  static async initialize(root: string) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    if (!await optional(join(root, "master.test-key"))) await once(join(root, "master.test-key"), randomBytes(32));
  }
  private async live(jobId: string) {
    if (await optional(join(this.root, opaqueIdSchema.parse(jobId), "revoked"))) throw new DurablePrivacyError("AUTHORIZATION_DENIED");
  }
  private binding(a: InventoryArtifact) {
    return JSON.stringify([a.jobId, a.packageId, a.organizationId, a.clientId, a.attemptId, a.fence,
      a.id, a.objectRef, a.keyRef, a.keyVersion, a.cryptoVersion, a.kind, a.taint]);
  }
  async read(a: InventoryArtifact) {
    const bytes = await persisted(this.path(a.jobId, a.objectRef, "object"));
    if (!bytes) return null;
    const wrapped = await persisted(this.path(a.jobId, a.keyRef, "key"));
    if (!wrapped) throw new DurablePrivacyError("ADAPTER_UNAVAILABLE");
    const master = await this.master();
    let key: Buffer | undefined;
    try { key = open(master, wrapped, a.keyRef); return open(key, bytes, this.binding(a)); }
    finally { key?.fill(0); master.fill(0); }
  }
  async write(a: InventoryArtifact, bytes: Uint8Array, authorize: () => Promise<void>) {
    await authorize(); await this.live(a.jobId);
    await mkdir(join(this.root, a.jobId), { recursive: true, mode: 0o700 });
    const old = await this.read(a);
    if (old) {
      const same = old.equals(Buffer.from(bytes)); old.fill(0);
      if (!same) throw new DurablePrivacyError("HASH_MISMATCH");
      await authorize(); return;
    }
    const keyPath = this.path(a.jobId, a.keyRef, "key");
    let wrapped = await persisted(keyPath); const master = await this.master();
    let key: Buffer | undefined;
    try {
      if (!wrapped) {
        key = randomBytes(32); wrapped = seal(master, key, a.keyRef);
        await this.checkpoint("BEFORE_KEY"); await authorize(); await this.live(a.jobId);
        await once(keyPath, wrapped, () => this.checkpoint("KEY_PENDING"));
        await this.checkpoint("AFTER_KEY");
      }
      key?.fill(0); key = open(master, wrapped, a.keyRef);
      await this.checkpoint("BEFORE_OBJECT"); await authorize(); await this.live(a.jobId);
      await once(this.path(a.jobId, a.objectRef, "object"), seal(key, bytes, this.binding(a)), () => this.checkpoint("OBJECT_PENDING"));
      await this.checkpoint("AFTER_OBJECT");
      await authorize(); await this.live(a.jobId);
    } catch (error) {
      if (a.taint === "RAW" && await optional(join(this.root, a.jobId, "revoked"))) await this.remove(a);
      throw error;
    } finally { key?.fill(0); master.fill(0); }
  }
  async tombstone(jobId: string) {
    opaqueIdSchema.parse(jobId);
    await mkdir(join(this.root, jobId), { recursive: true, mode: 0o700 });
    await once(join(this.root, jobId, "revoked"), Buffer.from("REVOKED"));
  }
  async remove(a: InventoryArtifact) {
    for (const path of [this.path(a.jobId, a.objectRef, "object"), this.path(a.jobId, a.keyRef, "key")]) {
      await remove(path); await remove(`${path}.pending`);
    }
  }
  async signer(): Promise<ReceiptSigner> {
    const master = await this.master(); const path = join(this.root, "signer.test-key");
    try {
      if (!await optional(path)) {
        const keys = generateKeyPairSync("ed25519");
        await once(path, seal(master, keys.privateKey.export({ type: "pkcs8", format: "der" }), "signer"));
      }
      const wrapped = await readFile(path); const plain = open(master, wrapped, "signer");
      const key = createPrivateKey({ key: plain, type: "pkcs8", format: "der" }); plain.fill(0);
      const keyId = "40000000-0000-4000-8000-000000000001";
      return {
        qualification: "TEST_ONLY",
        async sign(payload) { return { algorithm: "Ed25519", keyId, keyVersion: 1, value: sign(null, payload, key).toString("base64") }; },
        async verify(payload, signature) {
          return signature.keyId === keyId && signature.keyVersion === 1 && verify(null, payload, key, Buffer.from(signature.value, "base64"));
        },
      };
    } finally { master.fill(0); }
  }
  async saveReceipt(objectRef: string, value: unknown, hash: string) {
    opaqueIdSchema.parse(objectRef);
    if (privacyHash(value) !== hash) throw new DurablePrivacyError("HASH_MISMATCH");
    const path = join(this.root, `${objectRef}.safe-receipt`);
    const master = await this.master();
    try {
      const old = await optional(path);
      if (old) {
        const plain = open(master, old, objectRef);
        try { if (privacyHash(JSON.parse(plain.toString("utf8"))) !== hash) throw new DurablePrivacyError("HASH_MISMATCH"); }
        finally { plain.fill(0); }
      } else await once(path, seal(master, Buffer.from(JSON.stringify(value)), objectRef));
    } finally { master.fill(0); }
  }
}
