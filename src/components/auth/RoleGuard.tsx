"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser, type AuthUser } from "@/lib/auth";

interface Props {
  children: React.ReactNode;
  allowedRoles: string[];
  fallback?: string;
}

export default function RoleGuard({ children, allowedRoles, fallback = "/" }: Props) {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const u = getStoredUser();
    setUser(u);
    if (!u || !allowedRoles.includes(u.role)) {
      router.replace(fallback);
    }
    setChecked(true);
  }, [allowedRoles, fallback, router]);

  if (!checked) return null; // Loading state while checking

  if (!user || !allowedRoles.includes(user.role)) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-[16px] font-semibold text-[var(--text-primary)]">Akses Ditolak</p>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1">Anda tidak memiliki akses ke halaman ini.</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
