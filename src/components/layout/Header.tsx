"use client";

import { useState, useEffect } from "react";
import { Bell, Search } from "lucide-react";

interface HeaderProps {
  title: string;
  subtitle?: string;
}

export function Header({ title, subtitle }: HeaderProps) {
  const [time, setTime] = useState("");

  useEffect(() => {
    const tick = () => setTime(new Date().toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

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
          <button className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] active:scale-95 transition-transform relative">
            <Bell className="w-[18px] h-[18px] text-[var(--text-tertiary)]" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-[var(--red)] rounded-full ring-2 ring-[var(--bg-card)]" />
          </button>

        </div>
      </div>
    </header>
  );
}
