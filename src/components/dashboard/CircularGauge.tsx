"use client";

interface CircularGaugeProps {
  value: number;
  size?: number;
  strokeWidth?: number;
  color: string;
  label: string;
  sublabel?: string;
  icon?: React.ReactNode;
}

export function CircularGauge({ value, size = 120, strokeWidth = 8, color, label, sublabel, icon }: CircularGaugeProps) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(value, 100) / 100) * c;

  return (
    <div className="flex flex-col items-center gap-2 group">
      <div className="relative transition-transform duration-200 group-hover:scale-105" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--bg-input)" strokeWidth={strokeWidth} />
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round" strokeDasharray={c} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 1s cubic-bezier(0.25, 0.1, 0.25, 1)", filter: `drop-shadow(0 0 6px ${color}30)` }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {icon && <div className="mb-0.5 opacity-70" style={{ color }}>{icon}</div>}
          <span className="text-[22px] font-bold tracking-tight tabular-nums" style={{ color }}>{Math.round(value)}%</span>
        </div>
      </div>
      <div className="text-center">
        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{label}</p>
        {sublabel && <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{sublabel}</p>}
      </div>
    </div>
  );
}
