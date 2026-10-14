/**
 * True when the request announces a body larger than `maxBytes`. A client that does not announce a length is left to the
 * per-file checks, so this only turns away the oversized requests that are honest about their size before they are read.
 */
export function exceedsDeclaredBodyLimit(request: { headers: Pick<Headers, "get"> }, maxBytes: number) {
  const declared = Number(request.headers.get("content-length"));
  return Number.isFinite(declared) && declared > maxBytes;
}
