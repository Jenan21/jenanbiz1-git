import type { Prisma } from "@/generated/prisma/client";

/** Written by the pending payment request that an administrator reviews before a campaign is paid for and activated. */
export const MANUAL_REVIEW_PAYMENT_PROVIDER = "MANUAL_REVIEW";

/**
 * Written by the earlier self-service flow, which recorded a SUCCEEDED payment for the full budget without any money
 * having moved. Those rows are not revenue and are kept out of every revenue total.
 */
export const LEGACY_UNVERIFIED_PAYMENT_PROVIDER = "INTERNAL_CONFIRMATION";

/** A `Payment` filter that leaves out rows recorded without a real payment. A plain `not` would also drop rows with no provider. */
export const verifiedPaymentFilter: Prisma.PaymentWhereInput = {
  OR: [{ provider: null }, { provider: { not: LEGACY_UNVERIFIED_PAYMENT_PROVIDER } }],
};
