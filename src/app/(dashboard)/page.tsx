"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CircularGauge } from "@/components/dashboard/CircularGauge";
import { TrafficChart } from "@/components/dashboard/TrafficChart";
import { InterfaceTable } from "@/components/dashboard/InterfaceTable";
import { DeviceSelector } from "@/components/dashboard/DeviceSelector";
import { DeviceInfoCard } from "@/components/dashboard/DeviceInfoCard";
import { QuickActions } from "@/components/dashboard/QuickActions";
import { MikrotikAPI } from "@/lib/api";
import type { MikrotikDevice } from "@/lib/types";
import { formatPercent, formatBytes, formatBits } from "@/lib/utils";
import type { SystemResource, InterfaceInfo, TrafficDataPoint } from "@/lib/types";
import {
  Cpu,
  MemoryStick,
  HardDrive,
  ArrowUpDown,
  AlertCircle,
  Wifi,
  WifiOff,
  Thermometer,
} from "lucide-react";

export default function DashboardPage() {
  const [devices, setDevices] = useState<MikrotikDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [resource, setResource] = useState<SystemResource | null>(null);
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [trafficHistory, setTrafficHistory] = useState<TrafficDataPoint[]>([]);
  const [prevResource, setPrevResource] = useState<SystemResource | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [wanTraffic, setWanTraffic] = useState<{ rx: number; tx: number; interface: string | null }>({ rx: 0, tx: 0, interface: null });
  const apiRef = useRef<MikrotikAPI | null>(null);

  // Fetch devices list from API on mount
  useEffect(() => {
    MikrotikAPI.getDevices()
      .then((devs) => {
        setDevices(devs);
        if (devs.length > 0 && !selectedDevice) {
          setSelectedDevice(devs[0].id);
        }
      })
      .catch((err) => console.error("Failed to fetch devices:", err));
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      apiRef.current = new MikrotikAPI(selectedDevice);
      // Reset traffic history on device switch
      setTrafficHistory([]);
      setResource(null);
      setInterfaces([]);
    }
  }, [selectedDevice]);

  const fetchData = useCallback(async () => {
    if (!apiRef.current || !selectedDevice) return;
    try {
      const API_BASE = `${window.location.origin}/monitoring`;
      const [newResource, newInterfaces, wanRes] = await Promise.all([
        apiRef.current.getSystemResource(),
        apiRef.current.getInterfaces(),
        fetch(`${API_BASE}/api/wan-traffic?device=${selectedDevice}`, { cache: "no-store" })
          .then(r => r.ok ? r.json() : null)
          .catch(() => null),
      ]);
      setPrevResource(resource);
      setResource(newResource);
      setInterfaces(newInterfaces);

      // Use WAN-specific traffic for chart
      if (wanRes && wanRes.interface) {
        setWanTraffic({ rx: wanRes.rx, tx: wanRes.tx, interface: wanRes.interface });
        const now = new Date();
        const point: TrafficDataPoint = {
          time: now.toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" }),
          rx: wanRes.rx,
          tx: wanRes.tx,
        };
        setTrafficHistory(prev => {
          const next = [...prev, point];
          return next.length > 60 ? next.slice(-60) : next;
        });
      } else {
        setTrafficHistory(apiRef.current.addTrafficPoint(newInterfaces));
      }

      setError(null);
      setConnected(true);
    } catch (err: any) {
      console.error("Failed to fetch data:", err);
      setError(err.message || "Connection failed");
      setConnected(false);
    }
  }, [resource, selectedDevice]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const getTrend = (current: number, previous: number | undefined): "up" | "down" | "flat" => {
    if (!previous) return "flat";
    const diff = current - previous;
    if (Math.abs(diff) < 1) return "flat";
    return diff > 0 ? "up" : "down";
  };

  const totalRx = wanTraffic.rx;
  const totalTx = wanTraffic.tx;

  const currentDevice = devices.find((d) => d.id === selectedDevice);

  // Connection error state
  if (connected === false && !resource) {
    return (
      <>
        <Header title="Dashboard" subtitle="Real-time network monitoring" />
        <div className="flex items-center justify-center h-[calc(100vh-60px)] p-4">
          <div className="card p-8 max-w-md text-center animate-scale-in">
            <div className="w-16 h-16 rounded-2xl bg-[#FF3B30]/10 flex items-center justify-center mx-auto mb-4">
              <WifiOff className="w-8 h-8 text-[#FF3B30]" />
            </div>
            <h2 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">
              Connection Failed
            </h2>
            <p className="text-[14px] text-[var(--text-secondary)] mb-4">
              {error || "Unable to connect to Mikrotik device"}
            </p>
            <div className="card p-3 mb-4 text-left">
              <p className="text-[12px] text-[var(--text-tertiary)] mb-1">Device</p>
              <p className="text-[13px] font-mono text-[var(--text-primary)]">
                {currentDevice?.host}:{currentDevice?.port}
              </p>
            </div>
            <button onClick={fetchData} className="btn btn-primary w-full">
              Retry Connection
            </button>
          </div>
        </div>
      </>
    );
  }

  // Loading state
  if (!resource || devices.length === 0) {
    return (
      <>
        <Header title="Dashboard" subtitle="Real-time network monitoring" />
        <div className="flex items-center justify-center h-[calc(100vh-60px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
            <p className="text-[14px] text-[var(--text-secondary)]">
              {devices.length === 0 ? "Loading devices..." : `Connecting to ${currentDevice?.host || "..."}...`}
            </p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Dashboard" subtitle="Real-time network monitoring" />

      <div className="p-4 md:p-6 space-y-5">
        {/* Top Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <DeviceSelector
            devices={devices}
            selectedId={selectedDevice}
            onSelect={setSelectedDevice}
          />
          <div className="flex items-center gap-3">
            {error && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#FF3B30]/10">
                <AlertCircle className="w-3.5 h-3.5 text-[#FF3B30]" />
                <span className="text-[12px] font-medium text-[#FF3B30]">Reconnecting...</span>
              </div>
            )}
            {connected && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#34C759]/10">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34C759] animate-pulse" />
                <span className="text-[12px] font-medium text-[#34C759]">Live</span>
              </div>
            )}
            <span className="text-[12px] text-[var(--text-tertiary)]">2s refresh</span>
          </div>
        </div>

        {/* Metric Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MetricCard
            title="CPU Load"
            value={formatPercent(resource.cpuLoad)}
            percent={resource.cpuLoad}
            icon={<Cpu className="w-4 h-4" />}
            trend={getTrend(resource.cpuLoad, prevResource?.cpuLoad)}
            trendValue={prevResource ? `${Math.abs(Math.round(resource.cpuLoad - prevResource.cpuLoad))}%` : undefined}
          />
          <MetricCard
            title="Memory"
            value={formatPercent(resource.memoryPercent)}
            subtitle={`${formatBytes(resource.usedMemory * 1024 * 1024)} / ${formatBytes(resource.totalMemory * 1024 * 1024)}`}
            percent={resource.memoryPercent}
            icon={<MemoryStick className="w-4 h-4" />}
            trend={getTrend(resource.memoryPercent, prevResource?.memoryPercent)}
            trendValue={prevResource ? `${Math.abs(Math.round(resource.memoryPercent - prevResource.memoryPercent))}%` : undefined}
          />
          <MetricCard
            title="Storage"
            value={formatPercent(resource.diskPercent)}
            subtitle={resource.totalDisk > 0 ? `${formatBytes(resource.usedDisk * 1024 * 1024)} / ${formatBytes(resource.totalDisk * 1024 * 1024)}` : "N/A"}
            percent={resource.diskPercent}
            icon={<HardDrive className="w-4 h-4" />}
            trend="flat"
            trendValue="stable"
          />
          <MetricCard
            title="Total Traffic"
            value={formatBytes((totalRx + totalTx) / 8)}
            subtitle="Current throughput"
            icon={<ArrowUpDown className="w-4 h-4" />}
            color="#0A84FF"
            trend="up"
            trendValue={`${formatBytes(totalRx / 8)}/s ↓`}
          />
        </div>

        {/* Circular Gauges Row */}
        <div className="card p-5 animate-fade-in">
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-4">System Overview</h3>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-12">
            <CircularGauge
              value={resource.cpuLoad}
              size={110}
              strokeWidth={8}
              color={resource.cpuLoad < 60 ? "#34C759" : resource.cpuLoad < 80 ? "#FF9500" : "#FF3B30"}
              label="CPU"
              sublabel={`${resource.cpuCount} cores`}
              icon={<Cpu className="w-4 h-4" />}
            />
            <CircularGauge
              value={resource.memoryPercent}
              size={110}
              strokeWidth={8}
              color={resource.memoryPercent < 60 ? "#34C759" : resource.memoryPercent < 80 ? "#FF9500" : "#FF3B30"}
              label="Memory"
              sublabel={`${resource.usedMemory}MB used`}
              icon={<MemoryStick className="w-4 h-4" />}
            />
            <CircularGauge
              value={resource.diskPercent}
              size={110}
              strokeWidth={8}
              color={resource.diskPercent < 60 ? "#34C759" : resource.diskPercent < 80 ? "#FF9500" : "#FF3B30"}
              label="Storage"
              sublabel={resource.totalDisk > 0 ? `${resource.usedDisk}MB used` : "N/A"}
              icon={<HardDrive className="w-4 h-4" />}
            />
            {resource.temperature !== null && (
              <CircularGauge
                value={Math.min(100, (resource.temperature || 0) / 80 * 100)}
                size={110}
                strokeWidth={8}
                color={(resource.temperature || 0) < 50 ? "#34C759" : (resource.temperature || 0) < 70 ? "#FF9500" : "#FF3B30"}
                label="Temp"
                sublabel={`${resource.temperature}°C`}
                icon={<Thermometer className="w-4 h-4" />}
              />
            )}
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <TrafficChart data={trafficHistory} title={`WAN Traffic${wanTraffic.interface ? ` (${wanTraffic.interface})` : ""}`} />
          </div>
          <div className="space-y-4">
            <DeviceInfoCard device={currentDevice!} resource={resource} />
            <QuickActions />
          </div>
        </div>

        {/* Interface Table */}
        <InterfaceTable interfaces={interfaces} />

        {/* Per-Interface Mini Cards */}
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">Interface Details</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {interfaces.filter(i => i.type !== "pppoe-summary").slice(0, 6).map((iface, idx) => (
              <div
                key={iface.name}
                className="card p-4 animate-fade-in"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-[var(--text-tertiary)]" />
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">
                      {iface.name}
                    </span>
                  </div>
                  <span className={`badge ${iface.status === "up" ? "badge-green" : "badge-red"}`}>
                    {iface.status}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">
                      Download
                    </p>
                    <p className="text-[18px] font-semibold text-[#0A84FF] font-mono">
                      {formatBytes(iface.rxRate / 8)}/s
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">
                      Upload
                    </p>
                    <p className="text-[18px] font-semibold text-[#30D158] font-mono">
                      {formatBytes(iface.txRate / 8)}/s
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="h-1.5 rounded-full bg-[#0A84FF]/15 overflow-hidden">
                    <div
                      className="h-full bg-[#0A84FF] rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, (iface.rxRate / 1000000000) * 100)}%` }}
                    />
                  </div>
                  <div className="h-1.5 rounded-full bg-[#30D158]/15 overflow-hidden">
                    <div
                      className="h-full bg-[#30D158] rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(100, (iface.txRate / 1000000000) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
