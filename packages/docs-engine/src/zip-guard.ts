import JSZip from "jszip";

/** Raised for an uploaded document that is malformed or would exceed a resource ceiling. The message is safe to show to users. */
export class DocumentLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DocumentLimitError";
  }
}

export interface ZipLimits {
  /** Most entries (files and folders) an archive may hold. */
  maxEntries: number;
  /** Most bytes the whole archive may expand to. */
  maxUncompressedBytes: number;
  /** Most bytes any single entry may expand to. */
  maxEntryBytes: number;
  /** Highest expansion ratio tolerated once the archive expands past `ratioFloorBytes`. */
  maxCompressionRatio: number;
  /** Small archives may compress extremely well without being a risk, so the ratio is only enforced above this size. */
  ratioFloorBytes: number;
}

export const DEFAULT_ZIP_LIMITS: Readonly<ZipLimits> = {
  maxEntries: 10_000,
  maxUncompressedBytes: 100 * 1024 * 1024,
  maxEntryBytes: 50 * 1024 * 1024,
  maxCompressionRatio: 100,
  ratioFloorBytes: 10 * 1024 * 1024,
};

export interface ZipInspection {
  entryNames: string[];
  compressedBytes: number;
  uncompressedBytes: number;
}

type ZipBytes = Uint8Array | ArrayBuffer;

interface ZipEntryStream {
  on(event: "data", listener: (chunk: Uint8Array) => void): ZipEntryStream;
  on(event: "end", listener: () => void): ZipEntryStream;
  on(event: "error", listener: (error: unknown) => void): ZipEntryStream;
  pause(): ZipEntryStream;
  resume(): ZipEntryStream;
}

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));

function toBytes(input: ZipBytes) {
  return input instanceof Uint8Array ? input : new Uint8Array(input);
}

/** The entry count announced by the end-of-central-directory record, or null when it cannot be read cheaply. */
function announcedEntryCount(bytes: Uint8Array) {
  if (bytes.byteLength < 22) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lowest = Math.max(0, bytes.byteLength - 22 - 0xffff);
  for (let offset = bytes.byteLength - 22; offset >= lowest; offset -= 1) {
    if (view.getUint32(offset, true) !== END_OF_CENTRAL_DIRECTORY) continue;
    const total = view.getUint16(offset + 10, true);
    return total === 0xffff ? null : total;
  }
  return null;
}

async function openArchive(bytes: Uint8Array, limits: ZipLimits) {
  const announced = announcedEntryCount(bytes);
  if (announced !== null && announced > limits.maxEntries) throw new DocumentLimitError(`The archive holds more than ${limits.maxEntries} entries.`);
  let archive: JSZip;
  try {
    archive = await JSZip.loadAsync(bytes);
  } catch {
    throw new DocumentLimitError("The file is not a valid Office document archive.");
  }
  const entries = Object.values(archive.files);
  if (entries.length > limits.maxEntries) throw new DocumentLimitError(`The archive holds more than ${limits.maxEntries} entries.`);
  return entries;
}

// JSZip keeps the sizes declared by the central directory on a private property, read as signed 32-bit integers
// (a declared size of 2 GiB or more arrives negative). Fail closed if they are missing or make no sense.
function declaredSizes(entry: JSZip.JSZipObject) {
  const data = (entry as unknown as { _data?: { compressedSize?: unknown; uncompressedSize?: unknown } })._data;
  const compressed = unsignedSize(data?.compressedSize);
  const uncompressed = unsignedSize(data?.uncompressedSize);
  if (compressed === null || uncompressed === null) throw new DocumentLimitError("The archive could not be inspected.");
  return { compressed, uncompressed };
}

function unsignedSize(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < -(2 ** 31) || value > 2 ** 32 - 1) return null;
  return value < 0 ? value + 2 ** 32 : value;
}

/** Streams one entry through the decompressor and counts the bytes it really produces, stopping as soon as `onBytes` objects. */
function measureEntry(entry: JSZip.JSZipObject, onBytes: (entryTotal: number, chunkLength: number) => DocumentLimitError | null) {
  return new Promise<number>((resolve, reject) => {
    let total = 0;
    let settled = false;
    const stream = (entry as unknown as { internalStream(type: "uint8array"): ZipEntryStream }).internalStream("uint8array");
    stream
      .on("data", (chunk) => {
        if (settled) return;
        total += chunk.byteLength;
        const problem = onBytes(total, chunk.byteLength);
        if (!problem) return;
        settled = true;
        stream.pause();
        reject(problem);
      })
      .on("error", (error) => {
        if (settled) return;
        settled = true;
        reject(error);
      })
      .on("end", () => {
        if (settled) return;
        settled = true;
        resolve(total);
      })
      .resume();
  });
}

/** Names of the archive's entries. Nothing is decompressed; the entry count is still bounded. */
export async function listZipEntryNames(input: ZipBytes, limits: Partial<ZipLimits> = {}) {
  const entries = await openArchive(toBytes(input), { ...DEFAULT_ZIP_LIMITS, ...limits });
  return entries.map((entry) => entry.name);
}

/**
 * Refuses a zip-based file (xlsx, docx, pptx) before a parser unpacks it: too many entries, an entry or archive that
 * expands past the limit, or an implausible compression ratio. The sizes in the central directory are checked first;
 * because they can lie, every entry is then streamed through the decompressor and counted, which stops the moment an
 * entry produces more than it declared or the archive passes its total.
 */
export async function assertSafeZipArchive(input: ZipBytes, limits: Partial<ZipLimits> = {}): Promise<ZipInspection> {
  const effective = { ...DEFAULT_ZIP_LIMITS, ...limits };
  const entries = (await openArchive(toBytes(input), effective)).filter((entry) => !entry.dir);

  let declaredTotal = 0;
  let compressedTotal = 0;
  for (const entry of entries) {
    const { compressed, uncompressed } = declaredSizes(entry);
    if (uncompressed > effective.maxEntryBytes) throw new DocumentLimitError(`An entry in the archive expands to more than ${megabytes(effective.maxEntryBytes)} MB.`);
    declaredTotal += uncompressed;
    compressedTotal += compressed;
    if (declaredTotal > effective.maxUncompressedBytes) throw new DocumentLimitError(`The archive expands to more than ${megabytes(effective.maxUncompressedBytes)} MB.`);
  }
  if (declaredTotal >= effective.ratioFloorBytes && declaredTotal / Math.max(compressedTotal, 1) > effective.maxCompressionRatio) {
    throw new DocumentLimitError("The archive is compressed implausibly well and was refused.");
  }

  let actualTotal = 0;
  for (const entry of entries) {
    const { uncompressed: declared } = declaredSizes(entry);
    let produced = 0;
    try {
      produced = await measureEntry(entry, (entryTotal, length) => {
        actualTotal += length;
        if (entryTotal > declared) return new DocumentLimitError("The archive declares sizes that do not match its contents.");
        if (actualTotal > effective.maxUncompressedBytes) return new DocumentLimitError(`The archive expands to more than ${megabytes(effective.maxUncompressedBytes)} MB.`);
        return null;
      });
    } catch (error) {
      if (error instanceof DocumentLimitError) throw error;
      throw new DocumentLimitError("The archive is damaged and could not be read.");
    }
    if (produced !== declared) throw new DocumentLimitError("The archive declares sizes that do not match its contents.");
  }

  return { compressedBytes: compressedTotal, entryNames: entries.map((entry) => entry.name), uncompressedBytes: actualTotal };
}
