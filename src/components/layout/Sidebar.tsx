"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { MikrotikAPI } from "@/lib/api";
import type { MikrotikDevice } from "@/lib/types";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  LayoutDashboard,
  Server,
  Bell,
  Settings,
  LogOut,
  Activity,
  Wifi,
  Menu,
  X,
  BarChart3,
  CreditCard,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";


const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin", "teknisi"] },
  { href: "/clients", label: "Status Client", icon: Wifi, roles: ["admin", "teknisi"] },
  { href: "/mrtg", label: "WAN Traffic", icon: BarChart3, roles: ["admin", "teknisi"] },
  { href: "/devices", label: "Devices", icon: Server, roles: ["admin"] },
  { href: "/traffic", label: "Traffic", icon: Activity, roles: ["admin", "teknisi"] },
  { href: "/billing", label: "Billing", icon: CreditCard, roles: ["admin", "admin_pembayaran"] },
  { href: "/alerts", label: "Alerts", icon: Bell, roles: ["admin", "teknisi"] },
  { href: "/settings", label: "Settings", icon: Settings, roles: ["admin", "teknisi"] },
];

export function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<MikrotikDevice[]>([]);
  const { user, logout } = useAuth();

  useEffect(() => { setOpen(false); }, []);
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Fetch devices for Quick Status
  useEffect(() => {
    const fetchDevices = () => {
      MikrotikAPI.getDevices()
        .then(setDevices)
        .catch(console.error);
    };
    fetchDevices();
    const interval = setInterval(fetchDevices, 15000);
    return () => clearInterval(interval);
  }, []);

  const onlineCount = devices.filter(d => d.status === "online").length;
  const offlineCount = devices.filter(d => d.status === "offline").length;

  const displayName = user?.name || "Admin";
  const displayEmail = user?.username ? `${user.username}@amanna` : "admin@amanna";
  const initials = displayName.charAt(0).toUpperCase();
  const userRole = user?.role || "admin";
  const roleLabel = userRole === "admin" ? "Administrator" : userRole === "teknisi" ? "Teknisi" : "Admin Pembayaran";

  // Filter nav items by role
  const filteredNavItems = navItems.filter(item => item.roles.includes(userRole));

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed top-0 left-0 right-0 z-[60] flex items-center gap-3 px-4 py-3 bg-[var(--bg-card)] border-b border-[var(--border)] md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] active:scale-95 transition-transform"
          aria-label="Menu"
        >
          <Menu className="w-5 h-5 text-[var(--text-primary)]" />
        </button>
        <div className="flex items-center gap-2">
          <Image src="/monitoring/logo.png" alt="AMANNA" width={28} height={28} className="rounded-md" />
          <span className="text-[15px] font-bold text-[var(--text-primary)] tracking-tight">AMANNA JATIPURO</span>
        </div>
        <div className="flex-1" />
        <ThemeToggle />
      </div>

      {/* Mobile overlay */}
      {open && (
        <div className="sidebar-overlay md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 md:top-0 left-0 bottom-0 z-[55] flex flex-col",
          "w-[260px] bg-[var(--sidebar-bg)] border-r border-[var(--sidebar-border)]",
          "transition-transform duration-300 ease-out",
          "md:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
        style={{ willChange: "transform" }}
      >
        {/* Close (mobile) */}
        <button
          onClick={() => setOpen(false)}
          className="absolute top-3 right-3 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] md:hidden"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-[var(--text-tertiary)]" />
        </button>

        {/* Logo */}
        <div className="px-5 pt-16 md:pt-5 pb-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] overflow-hidden flex items-center justify-center bg-white">
            <Image src="/monitoring/logo.png" alt="AMANNA" width={40} height={40} className="object-contain" />
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-[var(--text-primary)] tracking-tight leading-tight">AMANNA</h1>
            <p className="text-[11px] text-[var(--text-tertiary)] font-medium">JATIPURO</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto">
          {filteredNavItems.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link key={item.href} href={item.href} className={cn("nav-link", active && "active")}>
                <item.icon className="w-[18px] h-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Status */}
        <div className="px-3 pb-2">
          <div className="card p-3.5 space-y-2">
            <p className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">Quick Status</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="dot dot-green" />
                <span className="text-[13px] text-[var(--text-secondary)]">Online</span>
              </div>
              <span className="text-[13px] font-bold text-[var(--green)] tabular-nums">{onlineCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="dot dot-red" />
                <span className="text-[13px] text-[var(--text-secondary)]">Offline</span>
              </div>
              <span className="text-[13px] font-bold text-[var(--red)] tabular-nums">{offlineCount}</span>
            </div>
            {devices.length > 0 && (
              <div className="pt-1.5 mt-1.5 border-t border-[var(--border-light)] space-y-1">
                {devices.map(d => (
                  <div key={d.id} className="flex items-center gap-2">
                    <div className={cn("dot", d.status === "online" ? "dot-green" : "dot-red")} />
                    <span className="text-[11px] text-[var(--text-tertiary)] truncate flex-1">{d.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* User */}
        <div className="px-3 pb-4">
          <div
            onClick={() => logout()}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-[var(--blue)] to-[var(--purple)] flex items-center justify-center">
              <span className="text-[13px] font-bold text-white">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{displayName}</p>
              <p className="text-[11px] text-[var(--text-tertiary)]">{roleLabel}</p>
            </div>
            <LogOut className="w-4 h-4 text-[var(--text-tertiary)]" />
          </div>
        </div>
      </aside>
    </>
  );
}
