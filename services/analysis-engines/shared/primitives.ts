import { z } from "zod";

/**
 * Small schema primitives shared by the engine contracts. Result schemas never transform their input (no trim, no defaults
 * that change a value) so that parsing an engine result returns exactly what was validated; request schemas may normalize.
 */
export const identifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,127}$/, "Identifier of 1 to 128 characters: letters, digits and . _ : / @ -");
export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, "Lower-case hexadecimal SHA-256 digest");
export const timestampSchema = z.iso.datetime();
export const shortTextSchema = z.string().min(1).max(500);
export const longTextSchema = z.string().min(1).max(4000);
export const codeSchema = z.string().regex(/^[A-Z][A-Z0-9_]{2,63}$/, "Upper-case code such as DATA_STALE");

/** Every user-visible statement is stored in both languages, so no consumer has to translate a result. */
export const bilingualSchema = z.object({ ar: z.string().min(1).max(800), en: z.string().min(1).max(800) }).strict();
export type Bilingual = z.infer<typeof bilingualSchema>;

/** Dotted lower-case key such as `proximity.nearest.poi:hospital.distance`. */
export const metricKeySchema = z.string().max(120).regex(/^[a-z][a-z0-9_:]*(\.[a-z0-9_:]+)*$/, "Dotted lower-case key");
