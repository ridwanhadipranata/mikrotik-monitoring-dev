"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { DeviceSelector } from "@/components/dashboard/DeviceSelector";
import { MikrotikAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MikrotikDevice } from "@/lib/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  AreaChart,
} from "recharts";
import {
  Activity,
  Clock,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";

type TimeRange = "realtime" | "1min" | "10min" | "1h" | "1d";

const RANGE_LABELS: Record<TimeRange, string> = {
  realtime: "Realtime (5 detik)",
  "1min": "1 Menit (24 jam)",
  "10min": "10 Menit (7 hari)",
  "1h": "1 Jam (1 tahun)",
  "1d": "1 Hari (2 tahun)",
};

const RANGE_REFRESH: Record<TimeRange, number> = {
  realtime: 5000,
  "1min": 60000,
  "10min": 600000,
  "1h": 3600000,
  "1d": 86400000,
};

interface MrtgPoint {
  ts: number;
  rx: number;
  tx: number;
}

function formatBits(bps: number): string {
  if (!bps || bps === 0) return "0 bps";
  if (bps >= 1000000000) return `${(bps / 1000000000).toFixed(1)} Gbps`;
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function formatTime(ts: number, range: TimeRange): string {
  const d = new Date(ts);
  if (range === "realtime" || range === "1min") {
    return d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }
  if (range === "10min" || range === "1h") {
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) + " " +
      d.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

export default function MrtgPage() {
  const [devices, setDevices] = useState<MikrotikDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [range, setRange] = useState<TimeRange>("realtime");
  const [data, setData] = useState<MrtgPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [wanInterface, setWanInterface] = useState<string>("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    MikrotikAPI.getDevices()
      .then((devs) => {
        setDevices(devs);
        if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0].id);
      })
      .catch(console.error);
  }, []);

  const fetchData = useCallback(async () => {
    if (!selectedDevice) return;
    try {
      const API_BASE = `${window.location.origin}/monitoring`;
      const res = await fetch(`${API_BASE}/api/mrtg?device=${selectedDevice}&range=${range}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      setData(json.points || []);
      setWanInterface(json.interface || "");
    } catch (err) {
      console.error("MRTG fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedDevice, range]);

  useEffect(() => {
    if (!selectedDevice) return;
    setLoading(true);
    setData([]);

    // Initial fetch
    fetchData();

    // Auto-refresh based on range
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(fetchData, RANGE_REFRESH[range]);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [selectedDevice, range, fetchData]);

  // Chart data
  const chartData = data.map((p) => ({
    time: formatTime(p.ts, range),
    rx: Math.round(p.rx / 1000000 * 100) / 100, // Mbps
    tx: Math.round(p.tx / 1000000 * 100) / 100,
  }));

  // Summary stats
  const maxRx = data.length > 0 ? Math.max(...data.map(p => p.rx)) : 0;
  const maxTx = data.length > 0 ? Math.max(...data.map(p => p.tx)) : 0;
  const avgRx = data.length > 0 ? Math.round(data.reduce((s, p) => s + p.rx, 0) / data.length) : 0;
  const avgTx = data.length > 0 ? Math.round(data.reduce((s, p) => s + p.tx, 0) / data.length) : 0;
  const curRx = data.length > 0 ? data[data.length - 1].rx : 0;
  const curTx = data.length > 0 ? data[data.length - 1].tx : 0;

  return (
    <>
      <Header title="WAN Traffic MRTG" subtitle={wanInterface ? `Interface: ${wanInterface}` : "Historical traffic data"} />

      <div className="p-4 md:p-6 space-y-5">
        {/* Controls */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[var(--text-tertiary)] font-medium">Router:</span>
            <DeviceSelector
              devices={devices}
              selectedId={selectedDevice}
              onSelect={setSelectedDevice}
            />
          </div>

          {/* Time Range Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-input)] rounded-xl overflow-x-auto">
            {(Object.keys(RANGE_LABELS) as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all whitespace-nowrap",
                  range === r
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                )}
              >
                <Clock className="w-3 h-3" />
                {RANGE_LABELS[r]}
              </button>
            ))}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard label="Current RX" value={formatBits(curRx)} color="#0A84FF" icon={<ArrowDownRight className="w-3.5 h-3.5" />} />
          <StatCard label="Current TX" value={formatBits(curTx)} color="#30D158" icon={<ArrowUpRight className="w-3.5 h-3.5" />} />
          <StatCard label="Max RX" value={formatBits(maxRx)} color="#0A84FF" />
          <StatCard label="Max TX" value={formatBits(maxTx)} color="#30D158" />
          <StatCard label="Avg RX" value={formatBits(avgRx)} color="#0A84FF" />
          <StatCard label="Avg TX" value={formatBits(avgTx)} color="#30D158" />
        </div>

        {/* Chart */}
        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              Traffic Graph — {RANGE_LABELS[range]}
            </h3>
            <button onClick={fetchData} className="btn btn-secondary text-[12px]">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center h-[300px]">
              <div className="w-8 h-8 border-2 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
            </div>
          ) : chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-[var(--text-tertiary)]">
              <p className="text-[14px]">Belum ada data. Menunggu koleksi data...</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                <defs>
                  <linearGradient id="rxGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0A84FF" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0A84FF" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="txGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#30D158" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#30D158" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                  interval="preserveStartEnd"
                  minTickGap={50}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "var(--text-tertiary)" }}
                  tickFormatter={(v) => `${v} Mbps`}
                  width={80}
                />
                <Tooltip
                  contentStyle={{
                    background: "var(--bg-card)",
                    border: "1px solid var(--border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                  }}
                  formatter={(value: any, name: any) => [
                    `${Number(value).toFixed(2)} Mbps`,
                    name === "rx" ? "↓ Download" : "↑ Upload",
                  ]}
                />
                <Legend
                  formatter={(value) => (value === "rx" ? "↓ Download (RX)" : "↑ Upload (TX)")}
                />
                <Area
                  type="monotone"
                  dataKey="rx"
                  stroke="#0A84FF"
                  strokeWidth={2}
                  fill="url(#rxGradient)"
                  dot={false}
                  isAnimationActive={false}
                />
                <Area
                  type="monotone"
                  dataKey="tx"
                  stroke="#30D158"
                  strokeWidth={2}
                  fill="url(#txGradient)"
                  dot={false}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Info */}
        <div className="card p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-[var(--text-tertiary)]" />
            <span className="text-[13px] font-medium text-[var(--text-secondary)]">Data Collection Info</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-[12px]">
            <div>
              <p className="text-[var(--text-tertiary)]">Sample Interval</p>
              <p className="text-[var(--text-primary)] font-medium">5 detik</p>
            </div>
            <div>
              <p className="text-[var(--text-tertiary)]">Data Points</p>
              <p className="text-[var(--text-primary)] font-medium">{data.length}</p>
            </div>
            <div>
              <p className="text-[var(--text-tertiary)]">Interface</p>
              <p className="text-[var(--text-primary)] font-medium font-mono">{wanInterface || "—"}</p>
            </div>
            <div>
              <p className="text-[var(--text-tertiary)]">Auto Refresh</p>
              <p className="text-[var(--text-primary)] font-medium">{RANGE_REFRESH[range] / 1000}s</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, color, icon }: { label: string; value: string; color: string; icon?: React.ReactNode }) {
  return (
    <div className="card p-3 animate-fade-in">
      <div className="flex items-center gap-1.5 mb-1">
        {icon && <span style={{ color }}>{icon}</span>}
        <span className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className="text-[16px] font-semibold font-mono" style={{ color }}>{value}</p>
    </div>
  );
}
