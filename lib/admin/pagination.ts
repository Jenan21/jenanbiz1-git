import type { NextRequest } from "next/server";

export function getAdminPagination(request: NextRequest, defaultLimit = 50) {
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? defaultLimit);
  const requestedOffset = Number(request.nextUrl.searchParams.get("offset") ?? 0);
  const limit = Number.isInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : defaultLimit;
  const offset = Number.isInteger(requestedOffset)
    ? Math.max(requestedOffset, 0)
    : 0;
  return { limit, offset };
}

export function getAdminPageMetadata(total: number, limit: number, offset: number) {
  return { total, limit, offset, hasMore: offset + limit < total };
}