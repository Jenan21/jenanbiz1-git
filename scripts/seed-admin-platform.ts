import "dotenv/config";
import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

async function main() {
  const email = process.env.SUPER_ADMIN_EMAIL ?? "admin@jenan.local";
  const password = process.env.SUPER_ADMIN_PASSWORD ?? "Admin123!";

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Seed already exists");
    return;
  }

  const passwordHash = await hashPassword(password);

  const user = await db.user.create({
    data: {
      email,
      passwordHash,
      status: "ACTIVE",
      systemRole: "SUPER_ADMIN",
      profile: {
        create: {
          displayName: "Jenan Platform Owner",
          locale: "ar",
          language: "ar",
          countryCode: "SA",
          currency: "SAR",
          timezone: "Asia/Riyadh",
        },
      },
    },
  });

  await db.robot.createMany({
    data: [
      { name: "Core Dev Prime", slug: "core-dev-prime", team: "Development", intelligence: 98, skill: 96, experience: 93, status: "ACTIVE", isVisible: true },
      { name: "Signal Forge", slug: "signal-forge", team: "Innovation", intelligence: 97, skill: 95, experience: 92, status: "ACTIVE", isVisible: true },
      { name: "Trust Pilot", slug: "trust-pilot", team: "User Interaction", intelligence: 95, skill: 94, experience: 90, status: "ACTIVE", isVisible: true },
      { name: "Pulse Monitor", slug: "pulse-monitor", team: "Supervision", intelligence: 96, skill: 91, experience: 94, status: "ACTIVE", isVisible: true },
      { name: "Weak Bot", slug: "weak-bot", team: "Support", intelligence: 61, skill: 58, experience: 52, status: "HIDDEN", isVisible: false },
      { name: "Rookie Bot", slug: "rookie-bot", team: "Support", intelligence: 68, skill: 63, experience: 60, status: "REVIEW", isVisible: false },
    ],
  });

  console.log(`Seeded super admin and robots for ${user.email}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
