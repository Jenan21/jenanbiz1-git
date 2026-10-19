/**
 * What a member reads while the map is in maintenance or switched off; the rest of the platform keeps working.
 *
 * This module has no imports on purpose: client components use it, and importing it from `contracts.ts` would put the schema library into
 * their bundles. The platform's content security policy forbids script evaluation and zod 4 probes for it (`new Function`) as it builds a
 * schema, so every page that bundles a schema reports a policy violation.
 */
export const MAP_STOPPED_MESSAGE = "Jenan PRO Map قيد التحديث حاليًا، ستعود الخدمة قريبًا.";
