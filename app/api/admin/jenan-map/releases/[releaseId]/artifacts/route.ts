import { NextRequest } from "next/server";
import { z } from "zod";
import { access, failure, json } from "@/services/jenan-map/http";
import { idSchema, MapError } from "@/services/jenan-map/contracts";
import { importSchema, ingestArtifact, localImportStream } from "@/services/jenan-map/ingestion";

export const runtime = "nodejs";
const MULTIPART_LIMIT = 32 * 1024 * 1024;
export async function POST(request: NextRequest, context: { params: Promise<{ releaseId: string }> }) {
  try {
    const auth = await access(request, true, true);
    if (auth.response) return auth.response;
    const releaseId = idSchema.parse((await context.params).releaseId);
    if (request.headers.get("content-type")?.startsWith("multipart/form-data;")) {
      // Bound the body while reading, not merely the untrusted Content-Length header.
      const chunks: Uint8Array[] = [];
      let count = 0;
      if (!request.body) throw new MapError("IMPORT_BODY_REQUIRED", 400);
      const reader = request.body.getReader();
      try {
        for (;;) {
          const result = await reader.read();
          if (result.done) break;
          count += result.value.byteLength;
          if (count > MULTIPART_LIMIT) { await reader.cancel(); throw new MapError("USE_LOCAL_IMPORT_FOR_LARGE_ARTIFACTS", 413); }
          chunks.push(result.value);
        }
      } finally { reader.releaseLock(); }
      const body = Buffer.concat(chunks);
      const form = await new Response(body, { headers: { "content-type": request.headers.get("content-type")! } }).formData();
      if ([...form.keys()].some((key) => !["metadata", "file"].includes(key)) ||
          form.getAll("metadata").length !== 1 || form.getAll("file").length !== 1) throw new MapError("INVALID_IMPORT_FORM", 400);
      const file = form.get("file"), metadata = form.get("metadata");
      if (!(file instanceof File) || typeof metadata !== "string") throw new MapError("INVALID_IMPORT_FORM", 400);
      const input = importSchema.parse(JSON.parse(metadata));
      async function* bytes() { yield new Uint8Array(await (file as File).arrayBuffer()); }
      return json(await ingestArtifact(releaseId, input, bytes(), auth.user!.id), 201);
    }
    const input = z.object({ metadata: importSchema, stagedFilename: z.string().max(181) }).strict().parse(await request.json());
    const stream = await localImportStream(input.stagedFilename);
    try { return json(await ingestArtifact(releaseId, input.metadata, stream, auth.user!.id), 201); }
    finally { stream.destroy(); }
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) return json({ error: "INVALID_IMPORT_INPUT" }, 400);
    return failure(error);
  }
}
