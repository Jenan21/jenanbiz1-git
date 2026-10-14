"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Locale } from "@/types/i18n";

interface VerificationState {
  required: boolean;
  verified: boolean;
}

/**
 * A thin notice for signed-in members whose e-mail address is not verified, shown only while the platform requires
 * verification. It asks once per page view and stays quiet for verified members and when nothing is required.
 */
export function EmailVerificationNotice({ locale }: { locale: Locale }) {
  const ar = locale === "ar";
  const pathname = usePathname();
  const [state, setState] = useState<VerificationState | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/verify-email", { cache: "no-store", signal: controller.signal })
      .then((response) => (response.ok ? (response.json() as Promise<VerificationState>) : null))
      .then((payload) => setState(payload))
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  if (!state || !state.required || state.verified || pathname === "/user/verify-email") return null;
  return (
    <div className="email-verification-notice" role="status">
      <span>{ar ? "بريدك الإلكتروني غير موثّق بعد. وثّقه لقبول الدعوات واستخدام كل الميزات." : "Your e-mail address is not verified yet. Verify it to accept invitations and use every feature."}</span>
      <Link href={`/user/verify-email?next=${encodeURIComponent(pathname || "/dashboard")}`}>{ar ? "توثيق البريد" : "Verify e-mail"}</Link>
    </div>
  );
}
