"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { parseCallbackUrl } from "@/lib/auth";
import { setSession } from "@/lib/api";
import type { StoredSession } from "@/lib/types";
import { Loader2 } from "lucide-react";

export default function AuthCallback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const parsed = parseCallbackUrl(window.location.href);

    if (parsed.type === "success" && parsed.payload) {
      const session: StoredSession = {
        accessToken: parsed.payload.access_token,
        refreshToken: parsed.payload.refresh_token,
        tokenType: parsed.payload.token_type,
        expiresIn: parsed.payload.expires_in,
        user: parsed.payload.user,
      };
      setSession(session);
      router.replace("/");
    } else if (parsed.type === "error") {
      setError(parsed.message ?? "Authentication failed.");
    }
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center px-6">
        <div className="neo-error p-6 max-w-sm w-full text-center">
          <h2 className="text-xl font-bold text-red-700" style={{ fontFamily: "var(--font-heading)" }}>
            Login failed
          </h2>
          <p className="mt-2 text-sm text-red-800">{error}</p>
          <button
            onClick={() => router.replace("/")}
            className="neo-btn neo-btn-primary mt-4 w-full"
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <div className="text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center neo-card">
          <Loader2 className="h-8 w-8 animate-spin text-neo-orange" />
        </div>
        <h2 className="mt-5 text-2xl font-bold" style={{ fontFamily: "var(--font-heading)" }}>
          Signing you in
        </h2>
        <p className="mt-2 text-sm text-[#64748b]">
          Welcome back! Redirecting to your dashboard.
        </p>
      </div>
    </div>
  );
}
