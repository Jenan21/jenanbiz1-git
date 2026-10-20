export function focusLoopTarget<T>(
  active: T | null,
  items: readonly T[],
  backwards: boolean,
  container: T,
): T | null {
  if (!items.length) return container;
  if (backwards && (active === items[0] || active === container))
    return items[items.length - 1];
  if (
    !backwards &&
    (active === items[items.length - 1] || active === container)
  )
    return items[0];
  return null;
}
