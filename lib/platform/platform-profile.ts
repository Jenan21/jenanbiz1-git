import { z } from "zod";

/**
 * What the platform says about itself on the "About us" page. Everything here is entered by an administrator; nothing is
 * filled in for them, and a field left empty is shown as "not provided" rather than invented.
 */
const text = (max: number) => z.string().trim().max(max).default("");
const bilingual = (max: number) => z.object({ ar: text(max), en: text(max) }).default({ ar: "", en: "" });
const phone = z.string().trim().max(40).regex(/^[+0-9 ()-]{5,40}$/, "Invalid phone number");
const httpsUrl = z.string().trim().max(300).refine((value) => {
  if (!value) return true;
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}, "An https address is required");

export const platformProfileSchema = z.object({
  name: bilingual(120),
  summary: bilingual(1200),
  vision: bilingual(600),
  mission: bilingual(600),
  registration: z
    .object({
      commercialRegister: text(60),
      establishedYear: z.string().trim().regex(/^(|\d{4})$/, "A four-digit year").default(""),
      licenseNumber: text(60),
      vatNumber: text(60),
    })
    .default({ commercialRegister: "", establishedYear: "", licenseNumber: "", vatNumber: "" }),
  contacts: z
    .object({
      address: bilingual(300),
      emails: z.array(z.string().trim().toLowerCase().max(160).email().or(z.literal(""))).max(6).default([]),
      hours: bilingual(160),
      phones: z.array(phone.or(z.literal(""))).max(6).default([]),
      website: httpsUrl.default(""),
      whatsapp: phone.or(z.literal("")).default(""),
    })
    .default({ address: { ar: "", en: "" }, emails: [], hours: { ar: "", en: "" }, phones: [], website: "", whatsapp: "" }),
  achievements: z
    .array(z.object({ description: bilingual(240), title: bilingual(100), value: text(24) }))
    .max(8)
    .default([]),
});

export type PlatformProfile = z.infer<typeof platformProfileSchema>;

/** Drops the blank list entries and achievements the form leaves behind, so what is stored is only what was written. */
export function normalizePlatformProfile(input: PlatformProfile): PlatformProfile {
  return {
    ...input,
    contacts: {
      ...input.contacts,
      emails: input.contacts.emails.filter(Boolean),
      phones: input.contacts.phones.filter(Boolean),
    },
    achievements: input.achievements.filter((item) => item.title.ar || item.title.en || item.value || item.description.ar || item.description.en),
  };
}

export function profileText(value: { ar: string; en: string }, locale: "ar" | "en") {
  return (locale === "ar" ? value.ar || value.en : value.en || value.ar).trim();
}
