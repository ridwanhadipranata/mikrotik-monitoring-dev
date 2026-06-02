"use client";

import { cn, getStatusColorHex } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  percent?: number;
  icon: React.ReactNode;
  trend?: "up" | "down" | "flat";
  trendValue?: string;
  color?: string;
}

export function MetricCard({ title, value, subtitle, percent, icon, trend, trendValue, color }: MetricCardProps) {
  const accent = percent !== undefined ? getStatusColorHex(percent) : color || "var(--blue)";

  return (
    <div className="card p-4 md:p-5 anim-in group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] flex items-center justify-center" style={{ backgroundColor: `${accent}12` }}>
            <div style={{ color: accent }}>{icon}</div>
          </div>
          <span className="text-[13px] font-medium text-[var(--text-secondary)]">{title}</span>
        </div>
        {trend && trendValue && (
          <div className={cn("flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-md",
            trend === "up" && "text-[var(--red)] bg-[var(--red-soft)]",
            trend === "down" && "text-[var(--green)] bg-[var(--green-soft)]",
            trend === "flat" && "text-[var(--text-tertiary)] bg-[var(--bg-input)]"
          )}>
            {trend === "up" && <TrendingUp className="w-3 h-3" />}
            {trend === "down" && <TrendingDown className="w-3 h-3" />}
            {trend === "flat" && <Minus className="w-3 h-3" />}
            {trendValue}
          </div>
        )}
      </div>
      <div>
        <span className="text-[28px] md:text-[32px] font-bold tracking-tight leading-none tabular-nums" style={{ color: accent }}>{value}</span>
        {subtitle && <p className="text-[12px] text-[var(--text-tertiary)] mt-1.5">{subtitle}</p>}
      </div>
      {percent !== undefined && (
        <div className="mt-3.5">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${Math.min(100, percent)}%`, backgroundColor: accent }} />
          </div>
        </div>
      )}
    </div>
  );
}
