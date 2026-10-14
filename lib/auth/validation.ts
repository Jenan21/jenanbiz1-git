import { z } from "zod";
import { PASSWORD_MAX_LENGTH, passwordProblem } from "@/lib/auth/password-policy";

const email = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((value) => value.toLowerCase());
// The owner's rule: at least four characters and one capital letter (lib/auth/password-policy.ts).
const password = z
  .string()
  .max(PASSWORD_MAX_LENGTH)
  .refine((value) => passwordProblem(value) === null, { message: "Password does not meet the rule" });

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
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/)
    .optional(),
});

export const loginSchema = z.object({
  email,
  password: z.string().min(1).max(128),
  remember: z.boolean().optional().default(false),
});

export type RegisterData = z.infer<typeof registerSchema>;
export type LoginData = z.infer<typeof loginSchema>;
