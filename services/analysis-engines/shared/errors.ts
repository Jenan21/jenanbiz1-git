/** Error vocabulary shared by every analysis engine. Engines fail with these codes; data gaps are reported as gaps, never as errors. */
export const engineErrorCodes = [
  // The caller sent something the contract forbids (rejected before any computation).
  "INVALID_INPUT",
  // The estimated cost of the request is above the server budget.
  "REQUEST_TOO_LARGE",
  // The request asked for data the environment policy does not allow (for example unregistered Map layers in production).
  "MAP_LAYER_POLICY_VIOLATION",
  // A required computation backend could not be used and the run cannot proceed at all.
  "BACKEND_UNAVAILABLE",
  // The engine produced something that breaks its own contract. This is a defect, and it fails closed instead of returning the result.
  "CONTRACT_VIOLATION",
] as const;
export type EngineErrorCode = typeof engineErrorCodes[number];

const httpStatus: Record<EngineErrorCode, number> = {
  INVALID_INPUT: 400, REQUEST_TOO_LARGE: 422, MAP_LAYER_POLICY_VIOLATION: 403, BACKEND_UNAVAILABLE: 503, CONTRACT_VIOLATION: 500,
};
export type EngineErrorDetails = Record<string, string | number | boolean>;

export class EngineError extends Error {
  readonly status: number;
  constructor(public readonly code: EngineErrorCode, public readonly details: EngineErrorDetails = {}) {
    super(code);
    this.name = "EngineError";
    this.status = httpStatus[code];
  }
}
