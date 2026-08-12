import { z } from "zod";

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
const password = z.string().min(12).max(128);

export const registerSchema = z.object({
  displayName: z.string().trim().min(2).max(80),
  email,
  password,
  locale: z.enum(["ar", "en"]),
  language: z.enum(["ar", "en"]),
  countryCode: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  remember: z.boolean().optional().default(false),
});

export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
