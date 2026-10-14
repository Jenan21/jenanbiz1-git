/** The largest value a 32-bit integer column (`Int` in the Prisma schema) can hold. */
export const MAX_INT32 = 2_147_483_647;

export const MARKET_LIMITS = {
  /** Open offers (submitted or negotiating) one buyer may hold on one listing. */
  openOffersPerBuyerPerListing: 5,
  /** Open viewing requests (requested or confirmed) one person may hold on one listing. */
  openViewingsPerRequesterPerListing: 5,
  /** Rows per page for inquiries, viewings and offers when the caller does not ask for a size. */
  defaultPageSize: 100,
  /** Most rows per page for inquiries, viewings and offers. */
  maxPageSize: 200,
} as const;
