"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

const FAILURE_MESSAGES = {
  ar: "تعذر تسجيل الخروج. تحقق من اتصالك وحاول مجددًا.",
  en: "Could not log out. Check your connection and try again.",
} as const;

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<keyof typeof FAILURE_MESSAGES | null>(null);
  async function logout() {
    setLoading(true);
    setFailed(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout request failed");
      router.replace("/auth");
      router.refresh();
    } catch {
      // A failed request must not look like a successful sign-out: say so and let the person try again.
      setFailed(document.documentElement.lang === "ar" ? "ar" : "en");
      setLoading(false);
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        className="logout-button"
        onClick={logout}
        disabled={loading}
      >
        {loading ? "…" : label}
      </Button>
      {failed ? <span className="logout-error" role="alert">{FAILURE_MESSAGES[failed]}</span> : null}
    </>
  );
}
