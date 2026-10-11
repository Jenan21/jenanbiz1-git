import { del, get, put } from "@vercel/blob";
import type { DocumentStorageProvider } from "@/services/providers.contracts";

export class VercelBlobDocumentStorageProvider implements DocumentStorageProvider {
  readonly name = "vercel-blob-document-storage";

  async upload(key: string, bytes: Uint8Array, contentType: string) {
    await put(key, Buffer.from(bytes), {
      access: "private",
      addRandomSuffix: false,
      contentType,
    });
  }

  async download(key: string) {
    const result = await get(key, { access: "private" });
    if (!result || result.statusCode !== 200) {
      throw new Error("Stored document not found");
    }
    return new Uint8Array(await new Response(result.stream).arrayBuffer());
  }

  async delete(key: string) {
    await del(key);
  }
}

export const vercelBlobDocumentStorage = new VercelBlobDocumentStorageProvider();
