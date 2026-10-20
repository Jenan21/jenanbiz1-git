import { z } from "zod";
import {
  attributionEntrySchema, dataAvailabilitySchema, determinismSchema, engineIdentityShape, engineInputSchema, engineMetricSchema, findEnvelopeViolations, limitsShape, rightsSchema, timingSchema,
  type EnvelopeViolation,
} from "../shared/contracts";
import { compareText } from "../shared/canonical";
import { gapSchema } from "../shared/gaps";
import { identifierSchema, timestampSchema } from "../shared/primitives";
import { runStatuses } from "../shared/states";
import {
  MAX_AOI_AREA_KM2, MAX_AOI_PARTS, MAX_AOI_RINGS, MAX_AOI_VERTICES, MAX_CANDIDATES, MAX_NEAREST_COUNT, MAX_RADII, MAX_RADIUS_METERS, MAX_ROLES, MIN_RADIUS_METERS,
  PRIMARY_TARGET_ID, SEARCH_LADDER_METERS, SPATIAL_ENGINE_KEY, SPATIAL_REQUEST_CONTRACT, SPATIAL_RESULT_CONTRACT, spatialAnalyses, spatialExclusions,
} from "./constants";
import { spatialGapCatalog } from "./gaps";
import { approxAreaKm2, countVertices, crossesAntimeridian, ringIsClosed, ringsOf, type AreaGeometry } from "./geometry-precheck";
import { mapLayerPolicies } from "./policy";

// ------------------------------------------------------------------------------------------------------------------- roles
/**
 * A role says what a dataset is used for: `place:locality`, `poi:hospital`, `road:major`, `competitor:cafe`, `constraint:protected_area`
 * or `population`. The administrative roles (`admin:region` and so on) are implicit: the engine reads them to describe the location
 * and they cannot be requested.
 */
export const ROLE_PATTERN = /^(?:(?:place|poi|road|competitor|constraint)(?::[a-z][a-z0-9_]{0,39})?|population)$/;
export const roleSchema = z.string().regex(ROLE_PATTERN, "A role such as poi:hospital, place:locality, road:major, competitor:cafe, constraint:protected_area or population");
export const roleNamespace = (role: string) => role.split(":", 1)[0] as string;
/** Features that are counted, searched and measured: places, points of interest, roads and competitors. */
export const isFeatureRole = (role: string) => ["place", "poi", "road", "competitor"].includes(roleNamespace(role));
export const isConstraintRole = (role: string) => roleNamespace(role) === "constraint";
export const isPopulationRole = (role: string) => role === "population";

// --------------------------------------------------------------------------------------------------------------- locations
const longitude = z.number().min(-180).max(180);
const latitude = z.number().min(-90).max(90);
const position = z.tuple([longitude, latitude]);
const pointSchema = z.object({ type: z.literal("Point"), coordinates: position }).strict();
const ringSchema = z.array(position).min(4).max(MAX_AOI_VERTICES);
const polygonCoordinates = z.array(ringSchema).min(1).max(MAX_AOI_RINGS);
const polygonSchema = z.object({ type: z.literal("Polygon"), coordinates: polygonCoordinates }).strict();
const multiPolygonSchema = z.object({ type: z.literal("MultiPolygon"), coordinates: z.array(polygonCoordinates).min(1).max(MAX_AOI_PARTS) }).strict();

/** A location is a point or an area (Polygon or MultiPolygon), WGS84 longitude and latitude, as GeoJSON positions. */
export const locationSchema = z.discriminatedUnion("type", [pointSchema, polygonSchema, multiPolygonSchema]).superRefine((location, context) => {
  if (location.type === "Point") return;
  const area = location as AreaGeometry;
  if (!ringsOf(area).every(ringIsClosed)) context.addIssue({ code: "custom", message: "Every ring must be closed: its last position equals its first" });
  if (countVertices(area) > MAX_AOI_VERTICES) context.addIssue({ code: "custom", message: `An area has at most ${MAX_AOI_VERTICES} positions in total` });
  if (crossesAntimeridian(area)) context.addIssue({ code: "custom", message: "Areas that cross the antimeridian are not supported" });
  const areaKm2 = approxAreaKm2(area);
  if (areaKm2 <= 0) context.addIssue({ code: "custom", message: "The area has no extent" });
  else if (areaKm2 > MAX_AOI_AREA_KM2) context.addIssue({ code: "custom", message: `The area is larger than ${MAX_AOI_AREA_KM2} km²` });
});
export type SpatialLocation = z.infer<typeof locationSchema>;

const candidateIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,39}$/, "Lower-case candidate id").refine((id) => id !== PRIMARY_TARGET_ID, `"${PRIMARY_TARGET_ID}" is reserved for the main location`);
const candidateSchema = z.object({ id: candidateIdSchema, location: locationSchema }).strict();

// ------------------------------------------------------------------------------------------------------------------ parameters
const radiusSchema = z.number().int().min(MIN_RADIUS_METERS).max(MAX_RADIUS_METERS);
const searchLimitSchema = z.number().int().refine((value) => (SEARCH_LADDER_METERS as readonly number[]).includes(value), `One of ${SEARCH_LADDER_METERS.join(", ")} metres`);
const resolvedParametersSchema = z.object({
  radiiMeters: z.array(radiusSchema).min(1).max(MAX_RADII),
  roles: z.array(roleSchema).max(MAX_ROLES),
  nearestCount: z.number().int().min(1).max(MAX_NEAREST_COUNT),
  maxSearchMeters: searchLimitSchema,
  cluster: z.object({ epsMeters: z.number().int().min(50).max(5000), minPoints: z.number().int().min(2).max(100) }).strict(),
  grid: z.object({ cellMeters: z.number().int().min(100).max(5000) }).strict(),
}).strict();
export type SpatialParameters = z.infer<typeof resolvedParametersSchema>;

/** Pins a role to a specific dataset. Without a pin the engine discovers the published dataset for the role. */
const dataSelectionSchema = z.discriminatedUnion("source", [
  z.object({ source: z.literal("DATA_CENTER"), versionId: identifierSchema }).strict(),
  z.object({ source: z.literal("MAP"), layerKey: identifierSchema, releaseId: identifierSchema.optional() }).strict(),
]);
const dataRolesSchema = z.record(roleSchema, dataSelectionSchema);

interface RequestView {
  analyses: readonly string[];
  candidates?: ReadonlyArray<{ id: string }>;
  parameters?: { roles?: readonly string[] };
  data?: { roles?: Readonly<Record<string, unknown>> };
}
/** Rules that tie the analyses to the parameters they need. They are checked on the request and again on its normalized form. */
function checkRequest(request: RequestView, context: z.RefinementCtx) {
  const issue = (path: Array<string | number>, message: string) => context.addIssue({ code: "custom", path, message });
  const analyses = new Set(request.analyses);
  const roles = request.parameters?.roles ?? [];
  if ((analyses.has("PROXIMITY") || analyses.has("CATCHMENT") || analyses.has("DENSITY")) && !roles.some(isFeatureRole)) issue(["parameters", "roles"], "PROXIMITY, CATCHMENT and DENSITY need at least one feature role (place:*, poi:*, road:* or competitor:*)");
  if (analyses.has("CONSTRAINT_SCREENING") && !roles.some(isConstraintRole)) issue(["parameters", "roles"], "CONSTRAINT_SCREENING needs at least one constraint:* role");
  if (roles.some(isPopulationRole) && !analyses.has("CATCHMENT")) issue(["parameters", "roles"], "The population role is used by CATCHMENT");
  if (analyses.has("SITE_COMPARISON")) {
    if ((request.candidates?.length ?? 0) < 1) issue(["candidates"], "SITE_COMPARISON needs at least one candidate besides the main location");
    if (request.analyses.every((analysis) => analysis === "SITE_COMPARISON")) issue(["analyses"], "SITE_COMPARISON compares the results of other analyses, so request at least one more");
  }
  const ids = (request.candidates ?? []).map((candidate) => candidate.id);
  if (new Set(ids).size !== ids.length) issue(["candidates"], "Candidate ids must be unique");
  for (const role of Object.keys(request.data?.roles ?? {})) if (!roles.includes(role)) issue(["data", "roles", role], "A dataset can only be pinned for a role listed in parameters.roles");
}

// ---------------------------------------------------------------------------------------------------------------- the request
export const spatialRequestSchema = z.object({
  contract: z.literal(SPATIAL_REQUEST_CONTRACT),
  analyses: z.array(z.enum(spatialAnalyses)).min(1).max(spatialAnalyses.length),
  location: locationSchema,
  candidates: z.array(candidateSchema).max(MAX_CANDIDATES).optional(),
  parameters: resolvedParametersSchema.partial().optional(),
  data: z.object({ roles: dataRolesSchema.optional() }).strict().optional(),
  mapLayerPolicy: z.enum(mapLayerPolicies).optional(),
  // Neither member changes the analysis: requestId correlates the call, evaluatedAt lets a stored run be replayed at its original instant.
  options: z.object({ requestId: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(), evaluatedAt: timestampSchema.optional() }).strict().optional(),
}).strict().superRefine(checkRequest);
export type SpatialRequestInput = z.input<typeof spatialRequestSchema>;

/** The request as the engine understood it: every default filled in, lists sorted and de-duplicated. This is what is hashed and stored. */
export const normalizedSpatialRequestSchema = z.object({
  contract: z.literal(SPATIAL_REQUEST_CONTRACT),
  analyses: z.array(z.enum(spatialAnalyses)).min(1).max(spatialAnalyses.length),
  location: locationSchema,
  candidates: z.array(candidateSchema).max(MAX_CANDIDATES),
  parameters: resolvedParametersSchema,
  data: z.object({ roles: dataRolesSchema }).strict(),
}).strict().superRefine(checkRequest);
export type SpatialNormalizedRequest = z.infer<typeof normalizedSpatialRequestSchema>;

// ----------------------------------------------------------------------------------------------------------------- the result
const analysisResultSchema = z.object({
  analysis: z.enum(spatialAnalyses),
  target: z.string().min(1).max(40),
  metrics: z.array(engineMetricSchema).max(500),
}).strict();

export const spatialRuntimeSchema = z.object({
  backend: z.enum(["POSTGIS", "NONE"]),
  placement: z.enum(["APP_DATABASE", "DEDICATED_CONNECTION"]).nullable(),
  postgis: z.string().max(40).nullable(),
  geos: z.string().max(40).nullable(),
  proj: z.string().max(40).nullable(),
}).strict();
export type SpatialRuntime = z.infer<typeof spatialRuntimeSchema>;

export const spatialCapabilitiesSchema = z.object({
  analyses: z.array(z.enum(spatialAnalyses)).min(1).max(spatialAnalyses.length),
  excluded: z.array(z.enum(spatialExclusions)).max(spatialExclusions.length),
}).strict();

const spatialResultObject = z.object({
  contract: z.literal(SPATIAL_RESULT_CONTRACT),
  runId: identifierSchema,
  evaluatedAt: timestampSchema,
  engine: z.object({ ...engineIdentityShape, runtime: spatialRuntimeSchema, capabilities: spatialCapabilitiesSchema }).strict(),
  status: z.enum(runStatuses),
  request: z.object({
    normalized: normalizedSpatialRequestSchema,
    defaultsApplied: z.array(z.string().min(1).max(120)).max(20),
    mapLayerPolicy: z.enum(mapLayerPolicies),
  }).strict(),
  inputs: z.array(engineInputSchema).max(200),
  dataAvailability: z.array(dataAvailabilitySchema).max(64),
  results: z.array(analysisResultSchema).max(spatialAnalyses.length * (MAX_CANDIDATES + 1)),
  gaps: z.array(gapSchema).max(1000),
  attribution: z.array(attributionEntrySchema).max(200),
  rights: rightsSchema,
  determinism: determinismSchema,
  limits: z.object(limitsShape).strict(),
  timing: timingSchema,
}).strict();
export type SpatialResult = z.infer<typeof spatialResultObject>;

/**
 * Results are ordered by analysis (in the order of `spatialAnalyses`), then the main location first and the candidates by id,
 * so the same analysis always serializes the same way.
 */
export const resultOrderKey = (entry: { analysis: typeof spatialAnalyses[number]; target: string }) =>
  `${spatialAnalyses.indexOf(entry.analysis).toString().padStart(2, "0")}/${entry.target === PRIMARY_TARGET_ID ? "0" : `1:${entry.target}`}`;
export const compareAnalysisResults = (first: { analysis: typeof spatialAnalyses[number]; target: string }, second: { analysis: typeof spatialAnalyses[number]; target: string }) =>
  compareText(resultOrderKey(first), resultOrderKey(second));

/** Every way a Spatial result can contradict its contract: the shared envelope rules plus the rules of this engine. */
export function findSpatialResultViolations(result: SpatialResult): Array<EnvelopeViolation | { code: "SPATIAL_RULE"; path: string; detail: string }> {
  const violations: Array<EnvelopeViolation | { code: "SPATIAL_RULE"; path: string; detail: string }> = [...findEnvelopeViolations(result, { catalog: spatialGapCatalog })];
  const rule = (path: string, detail: string) => violations.push({ code: "SPATIAL_RULE", path, detail });
  if (result.engine.key !== SPATIAL_ENGINE_KEY) rule("engine.key", `The engine key is ${SPATIAL_ENGINE_KEY}`);
  if (result.engine.contracts.request !== SPATIAL_REQUEST_CONTRACT || result.engine.contracts.result !== SPATIAL_RESULT_CONTRACT) rule("engine.contracts", "The engine must name the Spatial request and result contracts");
  if (result.engine.environment === "production" && result.request.mapLayerPolicy !== "REGISTERED_ONLY") rule("request.mapLayerPolicy", "Production reads registered Map layers only");
  const targets = new Set([PRIMARY_TARGET_ID, ...result.request.normalized.candidates.map((candidate) => candidate.id)]);
  const requested = new Set<string>(result.request.normalized.analyses);
  const seen = new Set<string>();
  result.results.forEach((entry, index) => {
    const key = `${entry.analysis}/${entry.target}`;
    if (seen.has(key)) rule(`results[${index}]`, `Duplicate result for ${key}`);
    seen.add(key);
    if (!requested.has(entry.analysis)) rule(`results[${index}]`, `${entry.analysis} was not requested`);
    if (!targets.has(entry.target)) rule(`results[${index}]`, `Unknown target ${entry.target}`);
  });
  const order = result.results.map(resultOrderKey);
  if (order.join("|") !== [...order].sort(compareText).join("|")) rule("results", "Results must be ordered by analysis, then the main location, then candidates by id");
  return violations;
}

/** The result schema validates the shape and then runs every cross-check, so a parsed result is a consistent one. */
export const spatialResultSchema = spatialResultObject.superRefine((result, context) => {
  for (const violation of findSpatialResultViolations(result)) context.addIssue({ code: "custom", message: `${violation.code} at ${violation.path}: ${violation.detail}` });
});
