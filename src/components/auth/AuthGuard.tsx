"use client";

import { useEffect } from "react";
import { useAuth } from "./AuthProvider";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = "/monitoring/login";
    }
  }, [loading, isAuthenticated]);

  // Show nothing while checking auth
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--blue)] rounded-full animate-spin" />
          <p className="text-[13px] text-[var(--text-tertiary)]">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render children if not authenticated (redirect will happen)
  if (!isAuthenticated) return null;

  return <>{children}</>;
}
