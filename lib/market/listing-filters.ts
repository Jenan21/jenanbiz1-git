export interface ListingFilters {
  country: string;
  kind: string;
  query: string;
}

type Param = string | string[] | undefined;

const first = (value: Param) => (Array.isArray(value) ? value[0] : value) ?? "";

// Initial filters of the Market listings page from its URL (`?kind=BUSINESS`, `?q=...`); anything else is ignored.
export function initialListingFilters(params: { kind?: Param; q?: Param }): ListingFilters {
  const kind = first(params.kind).trim().toUpperCase();
  return {
    country: "",
    kind: kind === "PROJECT" || kind === "BUSINESS" ? kind : "",
    query: first(params.q).trim().slice(0, 80),
  };
}

// The supported filters as a query string, so a guest sent to sign-in lands back on the same filtered view.
export function listingFiltersQuery(filters: Pick<ListingFilters, "kind" | "query">): string {
  const params = new URLSearchParams();
  if (filters.kind) params.set("kind", filters.kind);
  if (filters.query) params.set("q", filters.query);
  const query = params.toString();
  return query ? `?${query}` : "";
}
