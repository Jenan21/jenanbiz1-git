"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton({ label }: { label: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  async function logout() {
    setLoading(true);
    const response = await fetch("/api/auth/logout", { method: "POST" });
    if (response.ok) {
      router.replace("/login");
      router.refresh();
      return;
    }
    setLoading(false);
  }
  return (
    <Button
      variant="ghost"
      className="logout-button"
      onClick={logout}
      disabled={loading}
    >
      {loading ? "…" : label}
    </Button>
  );
}
