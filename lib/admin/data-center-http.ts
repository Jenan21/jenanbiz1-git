export class DataCenterRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function readDataCenterBody(request: Request, limit: number): Promise<Uint8Array> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    throw new DataCenterRequestError("Request body exceeds the allowed size", 413);
  }
  if (!request.body) throw new DataCenterRequestError("Request body is required", 400);
  const reader = request.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new DataCenterRequestError("Request body exceeds the allowed size", 413);
      }
      parts.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.byteLength;
  }
  return result;
}

export async function readDataCenterJson(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") {
    throw new DataCenterRequestError("JSON content type is required", 415);
  }
  const bytes = await readDataCenterBody(request, 512 * 1024);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown;
  } catch {
    throw new DataCenterRequestError("Invalid JSON request", 400);
  }
}
