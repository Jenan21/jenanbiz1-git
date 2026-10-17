import { createHash, randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { chmod, link, mkdir, open, realpath, stat, unlink } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { idSchema, MapError, type Artifact } from "./contracts";
import { openArtifact, storageRoot } from "./storage";
import { validateArtifactFormat } from "./validation";

export const importSchema = z.object({
  kind: z.enum(["pmtiles", "style", "glyphs", "sprite", "schema", "coverage"]),
  filename: z.string().min(1).max(200),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  byteSize: z.number().int().positive().max(32 * 1024 ** 3),
  publicSafe: z.boolean(),
  exportAllowed: z.boolean().default(false),
  exportLicense: z.string().trim().min(3).max(2000).optional(),
  confirmation: z.literal("IMPORT OWNED MAP ARTIFACT"),
}).strict().superRefine((value, context) => {
  if (value.exportAllowed && !value.exportLicense) context.addIssue({ code: "custom", message: "Export license permission required" });
  const valid = value.kind === "glyphs"
    ? /^[^/\\\u0000-\u001f]{1,150}\/\d+-\d+\.pbf$/.test(value.filename)
    : /^[a-zA-Z0-9][a-zA-Z0-9._@-]{0,150}$/.test(value.filename);
  if (!valid) context.addIssue({ code: "custom", message: "Invalid logical asset filename" });
  if (["schema", "coverage"].includes(value.kind) && value.publicSafe) context.addIssue({ code: "custom", message: "Validation evidence is private" });
  const suffix = value.kind === "sprite" ? /\.(png|json)$/ : value.kind === "glyphs" ? /\.pbf$/ : value.kind === "pmtiles" ? /\.pmtiles$/ : /\.json$/;
  if (!suffix.test(value.filename)) context.addIssue({ code: "custom", message: "Invalid asset extension" });
});
export type ImportInput = z.infer<typeof importSchema>;

export async function assertImportCandidate(releaseId: string) {
  const [release] = await db.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM jenan_map.release WHERE id=${releaseId}::uuid`);
  if (!release || !["Draft", "Ready"].includes(release.status)) throw new MapError("IMPORT_REQUIRES_UNREVIEWED_RELEASE");
}

export async function localImportStream(filename: string) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(filename)) throw new MapError("INVALID_STAGED_FILENAME", 400);
  const configured = process.env.JENAN_MAP_STAGING_ROOT;
  if (!configured || !path.isAbsolute(configured)) throw new MapError("PRIVATE_STAGING_NOT_CONFIGURED", 503);
  const root = await realpath(configured), storage = await realpath(storageRoot());
  const publicRoot = await realpath(path.resolve("public")).catch(() => path.resolve("public"));
  if (root === publicRoot || root.startsWith(publicRoot + path.sep) || root === storage ||
      root.startsWith(storage + path.sep) || storage.startsWith(root + path.sep) ||
      ((await stat(root)).mode & 0o077) !== 0) throw new MapError("PRIVATE_STAGING_REQUIRED", 503);
  const handle = await open(path.join(root, filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  if (!(await handle.stat()).isFile()) { await handle.close(); throw new MapError("INVALID_STAGED_FILE", 400); }
  return handle.createReadStream({ autoClose: true });
}

export async function ingestArtifact(releaseId: string, input: ImportInput, stream: AsyncIterable<Uint8Array>, actor: string) {
  idSchema.parse(releaseId);
  input = importSchema.parse(input);
  try { await assertImportCandidate(releaseId); }
  catch (error) { if (stream instanceof Readable) stream.destroy(); throw error; }
  const root = await realpath(storageRoot());
  const publicRoot = await realpath(path.resolve("public")).catch(() => path.resolve("public"));
  if (root === publicRoot || root.startsWith(publicRoot + path.sep) || ((await stat(root)).mode & 0o077) !== 0) {
    throw new MapError("PRIVATE_STORAGE_REQUIRED", 503);
  }
  const folder = path.join(root, releaseId);
  await mkdir(folder, { mode: 0o700, recursive: true });
  if (await realpath(folder) !== folder) throw new MapError("INVALID_STORAGE_KEY", 503);
  const pending = path.join(folder, `.upload-${randomUUID()}`);
  const handle = await open(pending, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    let count = 0;
    const hash = createHash("sha256");
    for await (const chunk of stream) {
      count += chunk.byteLength;
      if (count > input.byteSize) throw new MapError("IMPORT_SIZE_MISMATCH", 413);
      hash.update(chunk); await handle.writeFile(chunk);
    }
    if (count !== input.byteSize || hash.digest("hex") !== input.sha256) throw new MapError("IMPORT_CHECKSUM_OR_SIZE_MISMATCH", 422);
    const extension = input.kind === "pmtiles" ? "pmtiles" : input.filename.endsWith(".json") ? "json" : "bin";
    const file: Artifact = {
      id: randomUUID(), releaseId, kind: input.kind, filename: input.filename,
      sha256: input.sha256, byteSize: BigInt(count), publicSafe: input.publicSafe,
      storageKey: `${releaseId}/${input.sha256}.${extension}`,
      mime: input.kind === "pmtiles" ? "application/vnd.pmtiles" : input.kind === "glyphs" ? "application/x-protobuf" : input.filename.endsWith(".png") ? "image/png" : "application/json",
    };
    await handle.sync();
    // Validation uses explicit positions; reset only the descriptor used by JSON readers.
    const validator = await open(pending, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await validateArtifactFormat(file, validator); } finally { await validator.close(); }
    await chmod(pending, 0o400);
    await db.$transaction(async (tx) => {
      const [release] = await tx.$queryRaw<{ status: string }[]>(Prisma.sql`SELECT status FROM jenan_map.release WHERE id=${releaseId}::uuid FOR UPDATE`);
      if (!release || !["Draft", "Ready"].includes(release.status)) throw new MapError("IMPORT_REQUIRES_UNREVIEWED_RELEASE");
      // Linking is atomic and never overwrites a retained artifact.
      try { await link(pending, path.join(root, file.storageKey)); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        // A prior failed/ambiguous transaction may have retained these exact bytes.
        // Never overwrite them or remove a file that a committed record may reference.
        await (await openArtifact(file, true)).close();
      }
      const directory = await open(folder, constants.O_RDONLY | constants.O_DIRECTORY);
      try { await directory.sync(); } finally { await directory.close(); }
      await tx.$executeRaw(Prisma.sql`INSERT INTO jenan_map.artifact
        (id,"releaseId",kind,"storageKey",filename,mime,sha256,"byteSize","publicSafe","exportAllowed","exportLicense")
        VALUES (${file.id}::uuid,${releaseId}::uuid,${file.kind},${file.storageKey},${file.filename},${file.mime},
          ${file.sha256},${file.byteSize},${file.publicSafe},${input.exportAllowed},${input.exportLicense ?? null})`);
      const metadata = JSON.stringify({ artifactId: file.id, kind: file.kind, sha256: file.sha256, byteSize: count, publicSafe: file.publicSafe, exportAllowed: input.exportAllowed });
      await tx.$executeRaw(Prisma.sql`INSERT INTO jenan_map.audit (id,"actorId",action,"releaseId",metadata)
        VALUES (${randomUUID()}::uuid,${actor},'artifact.imported',${releaseId}::uuid,${metadata}::jsonb)`);
      await tx.$executeRaw(Prisma.sql`INSERT INTO "AuditLog" (id,"actorId",action,"entityType","entityId",metadata)
        VALUES (${randomUUID()},${actor},'jenan_map.artifact.imported','JenanMapRelease',${releaseId},${metadata}::jsonb)`);
    }, { isolationLevel: "Serializable", timeout: 30_000 });
    return { id: file.id, releaseId, kind: file.kind, filename: file.filename, sha256: file.sha256, byteSize: count, reviewRequired: true };
  } finally {
    await handle.close();
    await unlink(pending).catch(() => {});
    if (stream instanceof Readable) stream.destroy();
  }
}
