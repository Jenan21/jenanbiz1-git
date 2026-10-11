import type { DocumentStorageProvider } from "@/services/providers.contracts";
import { localDocumentStorage } from "@/lib/storage/local-document-storage";
import { vercelBlobDocumentStorage } from "@/lib/storage/vercel-blob-document-storage";

export function resolveDocumentStorage(): DocumentStorageProvider {
  if (process.env.VERCEL === "1" && process.env.BLOB_STORE_ID) {
    return vercelBlobDocumentStorage;
  }
  return localDocumentStorage;
}

export const documentStorage = resolveDocumentStorage();
