import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { DocumentStorageProvider } from "@/services/providers.contracts";

const storageRoot = path.resolve(
  /* turbopackIgnore: true */ process.env.LOCAL_DOCUMENT_STORAGE_DIR ?? ".data/documents",
);

function resolveStoragePath(key: string) {
  const target = path.resolve(storageRoot, key);
  if (!target.startsWith(`${storageRoot}${path.sep}`))
    throw new Error("Invalid storage key");
  return target;
}

export class LocalDocumentStorageProvider implements DocumentStorageProvider {
  readonly name = "local-document-storage";

  async upload(key: string, bytes: Uint8Array, contentType: string) {
    void contentType;
    const target = resolveStoragePath(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }

  async download(key: string) {
    return new Uint8Array(await readFile(/* turbopackIgnore: true */ resolveStoragePath(key)));
  }

  async delete(key: string) {
    await rm(resolveStoragePath(key), { force: true });
  }
}

export const localDocumentStorage = new LocalDocumentStorageProvider();