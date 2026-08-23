import { db } from "@/lib/db";

export async function ensureAdminDataBootstrap() {
  try {
    const count = await db.user.count();
    if (count > 0) return { bootstrapped: true, count };

    await db.user.create({
      data: {
        email: "admin@jenan.local",
        passwordHash: "seeded-admin",
        status: "ACTIVE",
        systemRole: "ADMIN",
        profile: {
          create: {
            displayName: "Jenan Admin",
            locale: "ar",
            language: "ar",
            countryCode: "SA",
            currency: "SAR",
            timezone: "Asia/Riyadh",
          },
        },
      },
    });

    return { bootstrapped: true, count: 1 };
  } catch (error) {
    console.error("admin bootstrap failed", error);
    return { bootstrapped: false, error: String(error) };
  }
}
