import type { PlatformProfile } from "@/lib/platform/platform-profile";

/** The profile before anyone has written anything. Kept free of the validation library so a browser page can use it. */
export const emptyPlatformProfile: PlatformProfile = {
  name: { ar: "", en: "" },
  summary: { ar: "", en: "" },
  vision: { ar: "", en: "" },
  mission: { ar: "", en: "" },
  registration: { commercialRegister: "", establishedYear: "", licenseNumber: "", vatNumber: "" },
  contacts: { address: { ar: "", en: "" }, emails: [], hours: { ar: "", en: "" }, phones: [], website: "", whatsapp: "" },
  achievements: [],
};
