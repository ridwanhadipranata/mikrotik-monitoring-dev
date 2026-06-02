"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Sidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <div className="min-h-screen bg-[var(--bg-base)]">
          <Sidebar />
          <main
            className="min-h-screen"
            style={{ marginLeft: "var(--sidebar-width, 0px)", paddingTop: "var(--mobile-bar, 52px)" }}
          >
            {children}
          </main>
        </div>
      </AuthGuard>
    </AuthProvider>
  );
}
