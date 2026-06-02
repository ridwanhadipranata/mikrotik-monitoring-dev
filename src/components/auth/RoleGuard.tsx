"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getStoredUser } from "@/lib/auth";

interface Props {
  children: React.ReactNode;
  allowedRoles: string[];
  fallback?: string;
}

export default function RoleGuard({ children, allowedRoles, fallback = "/" }: Props) {
  const router = useRouter();

  useEffect(() => {
    const user = getStoredUser();
    if (!user || !allowedRoles.includes(user.role)) {
      router.replace(fallback);
    }
  }, [allowedRoles, fallback, router]);

  const user = getStoredUser();
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
