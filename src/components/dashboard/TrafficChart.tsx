"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { TrafficDataPoint } from "@/lib/types";
import { formatBits } from "@/lib/utils";

interface TrafficChartProps {
  data: TrafficDataPoint[];
  title?: string;
  height?: number;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload) return null;
  return (
    <div className="card p-3 !rounded-xl shadow-lg text-xs">
      <p className="text-[var(--text-tertiary)] mb-1.5 font-mono text-[11px]">
        {label}
      </p>
      {payload.map((entry: any, i: number) => (
        <div key={i} className="flex items-center gap-2 py-0.5">
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: entry.color }}
          />
          <span className="text-[var(--text-secondary)]">{entry.name}:</span>
          <span className="font-semibold text-[var(--text-primary)]">
            {formatBits(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

export function TrafficChart({ data, title = "Traffic", height = 240 }: TrafficChartProps) {
  const maxVal = useMemo(() => {
    if (data.length === 0) return 1000000;
    const maxRx = Math.max(...data.map((d) => d.rx));
    const maxTx = Math.max(...data.map((d) => d.tx));
    return Math.max(maxRx, maxTx, 1000) * 1.2;
  }, [data]);

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {title}
          </h3>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            Real-time bandwidth · last 2 min
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-[3px] rounded-full bg-[#0A84FF]" />
            <span className="text-[11px] text-[var(--text-tertiary)]">Download</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-[3px] rounded-full bg-[#30D158]" />
            <span className="text-[11px] text-[var(--text-tertiary)]">Upload</span>
          </div>
        </div>
      </div>

      <div style={{ height }} className="-ml-2">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data}>
            <defs>
              <linearGradient id="rxGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="txGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#30D158" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#30D158" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              tickLine={false}
              axisLine={false}
              interval="preserveStartEnd"
              tickCount={6}
            />
            <YAxis
              tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v) => formatBits(v).replace(/ /g, "")}
              width={55}
              domain={[0, maxVal]}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="rx"
              name="Download"
              stroke="#0A84FF"
              strokeWidth={2}
              fill="url(#rxGrad)"
              dot={false}
              animationDuration={300}
            />
            <Area
              type="monotone"
              dataKey="tx"
              name="Upload"
              stroke="#30D158"
              strokeWidth={2}
              fill="url(#txGrad)"
              dot={false}
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
