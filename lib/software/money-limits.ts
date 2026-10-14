/** The largest value a money column stores: the database keeps minor units in a signed 32-bit integer. */
export const MAX_MINOR_AMOUNT = 2_147_483_647;

/**
 * Totals are summed from several request fields that are each within bounds, so the sum can still leave the column's
 * range. Refuse it here with a clear sentence instead of letting the database reject the write.
 */
export function assertMinorAmount(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_MINOR_AMOUNT) throw new Error(`${label} exceeds the supported maximum`);
  return value;
}
