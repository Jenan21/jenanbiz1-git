import type { EngineInput } from "../shared/contracts";
import type { CoverageAssessment } from "./confidence";
import type { SpatialLocation } from "./contracts";
import { targetGeography } from "./dataset-features";
import { boundingBoxOf } from "./geometry-precheck";

/** Bounding boxes establish extent, never inventory completeness. A partially covered search remains undeclared. */
export function coverageFor(input: EngineInput, location: SpatialLocation, radiusMeters = 0): CoverageAssessment {
  const extent = input.coverage?.boundingBox;
  if (extent == null) return { status: "UNDECLARED" };
  const target = radiusMeters === 0 ? boundingBoxOf(location) : targetGeography([location], radiusMeters).boundingBox;
  if (target === undefined) return { status: "UNDECLARED" };
  if (target.west > extent.east || target.east < extent.west || target.south > extent.north || target.north < extent.south) return { status: "NONE" };
  const contains = extent.west <= target.west && extent.east >= target.east && extent.south <= target.south && extent.north >= target.north;
  return { status: contains ? "FULL" : "UNDECLARED" };
}
