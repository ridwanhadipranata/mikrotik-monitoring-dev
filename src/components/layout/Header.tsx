"use client";

import { useState, useEffect, useRef } from "react";
import { Bell, Search, WifiOff, CheckCircle, AlertTriangle, X } from "lucide-react";
import { authFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

interface NotifEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  host: string;
  type: string;
  message: string;
  timestamp: number;
}

export function Header({ title, subtitle }: HeaderProps) {
  const [time, setTime] = useState("");
  const [pending, setPending] = useState<NotifEntry[]>([]);
  const [history, setHistory] = useState<NotifEntry[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [hasNew, setHasNew] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const prevCountRef = useRef(0);

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // Poll notifications
  useEffect(() => {
    const fetchNotifs = async () => {
      try {
        const res = await authFetch("/monitoring/api/notifications", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        setPending(data.pending || []);
        setHistory(data.history || []);
        // Flash effect on new notifications
        if (data.pending.length > prevCountRef.current && prevCountRef.current > 0) {
          setHasNew(true);
          setTimeout(() => setHasNew(false), 3000);
        }
        prevCountRef.current = data.pending.length;
      } catch {}
    };
    fetchNotifs();
    const id = setInterval(fetchNotifs, 15000);
    return () => clearInterval(id);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "Baru saja";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m lalu`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}j lalu`;
    return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const allEntries = [...pending, ...history]
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 10);

  const pendingCount = pending.length;

  return (
    <header className="sticky top-0 z-30 bg-[var(--bg-card)] border-b border-[var(--border)]">
      <div className="flex items-center justify-between px-4 md:px-6 py-3 pt-[calc(0.75rem+env(safe-area-inset-top))] md:pt-3">
        <div className="ml-0 md:ml-0">
          <h2 className="text-[17px] md:text-[20px] font-bold text-[var(--text-primary)] tracking-tight">{title}</h2>
          {subtitle && <p className="text-[12px] md:text-[13px] text-[var(--text-tertiary)] mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="hidden sm:flex items-center px-3 py-1.5 rounded-lg bg-[var(--bg-input)] text-[12px] font-mono text-[var(--text-secondary)] tabular-nums">{time}</div>
          <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] active:scale-95 transition-transform">
            <Search className="w-[18px] h-[18px] text-[var(--text-tertiary)]" />
          </button>

          {/* Notification Bell */}
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] active:scale-95 transition-all relative",
                hasNew && "animate-bell"
              )}
            >
              <Bell className={cn("w-[18px] h-[18px] transition-colors", pendingCount > 0 ? "text-[#FF3B30]" : "text-[var(--text-tertiary)]")} />
              {pendingCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-[#FF3B30] text-white text-[10px] font-bold rounded-full flex items-center justify-center ring-2 ring-[var(--bg-card)]">
                  {pendingCount}
                </span>
              )}
            </button>

            {/* Dropdown */}
            {showDropdown && (
              <div className="absolute right-0 top-full mt-2 w-[360px] max-h-[480px] bg-[var(--bg-card)] rounded-2xl shadow-2xl border border-[var(--border)] overflow-hidden z-50 animate-fade-in">
                <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#FF9500]" />
                    <span className="text-[14px] font-semibold text-[var(--text-primary)]">Router Alerts</span>
                    {pendingCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded-full bg-[#FF3B30] text-white text-[10px] font-bold">{pendingCount}</span>
                    )}
                  </div>
                  <button onClick={() => setShowDropdown(false)} className="p-1 hover:bg-[var(--bg-hover)] rounded-lg">
                    <X className="w-4 h-4 text-[var(--text-tertiary)]" />
                  </button>
                </div>

                <div className="overflow-y-auto max-h-[360px]">
                  {allEntries.length === 0 ? (
                    <div className="p-8 flex flex-col items-center gap-2">
                      <CheckCircle className="w-8 h-8 text-[#34C759]" />
                      <p className="text-[13px] text-[var(--text-tertiary)]">Semua router normal</p>
                    </div>
                  ) : (
                    allEntries.map((entry) => {
                      const isPending = pending.find(p => p.id === entry.id);
                      const isRecovered = entry.type === "recovered";
                      return (
                        <div
                          key={entry.id}
                          className={cn(
                            "flex items-start gap-3 px-4 py-3 border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg-hover)] transition-colors",
                            isPending && "bg-[#FF3B30]/5"
                          )}
                        >
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5",
                            isRecovered ? "bg-[#34C759]/10 text-[#34C759]" : "bg-[#FF3B30]/10 text-[#FF3B30]"
                          )}>
                            {isRecovered ? <CheckCircle className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              <span className="text-[12px] font-medium text-[var(--text-primary)] truncate">{entry.deviceName}</span>
                              <span className="text-[11px] text-[var(--text-tertiary)] shrink-0">{formatTime(entry.timestamp)}</span>
                            </div>
                            <p className="text-[12px] text-[var(--text-tertiary)] line-clamp-2">{entry.message}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                <Link
                  href="/alerts"
                  onClick={() => setShowDropdown(false)}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 border-t border-[var(--border)] text-[13px] font-medium text-[#0A84FF] hover:bg-[var(--bg-hover)] transition-colors"
                >
                  Lihat Semua Alerts
                </Link>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
