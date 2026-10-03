export function safeAuthRedirect(value: string | null, origin: string) {
  if (
    !value?.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)
  ) {
    return "/dashboard";
  }
  try {
    const base = new URL(origin);
    const target = new URL(value, base);
    return target.origin === base.origin && !target.pathname.startsWith("//")
      ? `${target.pathname}${target.search}${target.hash}`
      : "/dashboard";
  } catch {
    return "/dashboard";
  }
}
