"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function LogoutButton({
  label,
  errorMessage,
}: {
  label: string;
  errorMessage: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  async function logout() {
    setError(false);
    setLoading(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Logout request failed");
      router.replace("/auth");
      router.refresh();
    } catch {
      setError(true);
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
      {error && <span className="logout-error" role="alert">{errorMessage}</span>}
    </>
  );
}
