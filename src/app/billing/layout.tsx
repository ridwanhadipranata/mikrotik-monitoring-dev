"use client";

import { AuthProvider } from "@/components/auth/AuthProvider";
import { AuthGuard } from "@/components/auth/AuthGuard";
import RoleGuard from "@/components/auth/RoleGuard";
import { Sidebar } from "@/components/layout/Sidebar";

export default function BillingLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <AuthGuard>
        <RoleGuard allowedRoles={["admin", "admin_pembayaran"]} fallback="/">
          <div className="min-h-screen bg-[var(--bg-base)]">
            <Sidebar />
            <main
              className="min-h-screen"
              style={{ marginLeft: "var(--sidebar-width, 0px)", paddingTop: "var(--mobile-bar, 52px)" }}
            >
              {children}
            </main>
          </div>
        </RoleGuard>
      </AuthGuard>
    </AuthProvider>
  );
}
