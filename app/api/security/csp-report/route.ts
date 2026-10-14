import { NextRequest, NextResponse } from "next/server";
import { enforceRouteRateLimit } from "@/lib/rate-limit/route-rate-limit";

const MAX_REPORT_BYTES = 16 * 1024;

type Report = Record<string, unknown>;

/** Both report formats (legacy `csp-report`, Reporting API `csp-violation`) reduced to the fields worth logging. */
function summarize(payload: unknown): Report[] {
  const items = Array.isArray(payload) ? payload : [payload];
  return items.slice(0, 5).flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const record = item as Report;
    const body = (record["csp-report"] ?? record.body ?? record) as Report;
    if (!body || typeof body !== "object") return [];
    const text = (value: unknown, max = 200) => (typeof value === "string" ? value.slice(0, max) : undefined);
    const path = (value: unknown) => {
      try {
        return new URL(String(value)).pathname.slice(0, 120);
      } catch {
        return text(value, 60);
      }
    };
    return [
      {
        directive: text(body["effective-directive"] ?? body.effectiveDirective ?? body["violated-directive"] ?? body.violatedDirective, 60),
        blocked: text(body["blocked-uri"] ?? body.blockedURL ?? body.blockedUri, 120),
        page: path(body["document-uri"] ?? body.documentURL ?? body.documentUri),
        sample: text(body["script-sample"] ?? body.sample, 80),
        disposition: text(body.disposition, 20),
      },
    ];
  });
}

// Browsers post violation reports here: the policy carries `report-uri`, so a blocked resource is logged as well as refused.
export async function POST(request: NextRequest) {
  const limited = await enforceRouteRateLimit(request, { scope: "csp-report", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REPORT_BYTES) return new NextResponse(null, { status: 413 });
  try {
    const text = await request.text();
    if (text.length > MAX_REPORT_BYTES) return new NextResponse(null, { status: 413 });
    for (const report of summarize(JSON.parse(text))) console.warn("[csp-violation]", JSON.stringify(report));
  } catch {
    // Malformed reports are ignored; the endpoint never echoes anything back.
  }
  return new NextResponse(null, { status: 204, headers: { "cache-control": "no-store" } });
}
