let depth = 0;

/**
 * Counts the pages of the platform opened before the current one in this tab, so "back" never leaves the platform.
 * Only real history pushes count (a redirect replaces the entry), and every back or forward step subtracts one, so the
 * estimate can fall short but never run ahead of the real history.
 */
export function trackHistoryDepth(): () => void {
  const original = window.history.pushState;
  window.history.pushState = function pushState(...args: Parameters<History["pushState"]>) {
    depth += 1;
    return original.apply(this, args);
  };
  const onPop = () => { depth = Math.max(0, depth - 1); };
  window.addEventListener("popstate", onPop);
  return () => {
    window.removeEventListener("popstate", onPop);
    window.history.pushState = original;
  };
}

export function hasPlatformHistory(): boolean {
  return depth > 0;
}
