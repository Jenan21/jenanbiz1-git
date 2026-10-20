export class ObjectStoreError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, status?: number);
}
export const MAX_SINGLE_PUT_BYTES: number;

export type S3Config = {
  endpoint: string; bucket: string; region: string; accessKeyId: string; secretAccessKey: string; prefix: string; pathStyle: boolean;
};

export function signRequest(input: {
  method: string; url: string; headers?: Record<string, string>; payloadHash?: string; accessKeyId: string; secretAccessKey: string;
  region: string; service?: string; now?: Date;
}): Record<string, string>;

export function s3ConfigFromEnv(env?: Record<string, string | undefined>): S3Config | null;

export type ObjectInfo = { size: number; sha256: string | null; etag: string | null };
export type S3Store = {
  head(key: string): Promise<ObjectInfo | null>;
  range(key: string, start: number, end: number, signal?: AbortSignal): Promise<ReadableStream<Uint8Array>>;
  putFile(key: string, filePath: string, size: number, sha256: string): Promise<"created" | "exists">;
  putBytes(key: string, bytes: Buffer, sha256: string): Promise<"created" | "exists">;
  ping(): Promise<boolean>;
};
export function createS3Store(config: Pick<S3Config, "endpoint" | "bucket" | "accessKeyId" | "secretAccessKey"> & Partial<S3Config> & {
  fetchImpl?: typeof fetch; clock?: () => Date;
}): S3Store;
