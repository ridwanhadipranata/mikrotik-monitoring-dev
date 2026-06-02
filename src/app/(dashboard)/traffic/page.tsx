"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Header } from "@/components/layout/Header";
import { TrafficChart } from "@/components/dashboard/TrafficChart";
import { DeviceSelector } from "@/components/dashboard/DeviceSelector";
import { MikrotikAPI } from "@/lib/api";
import { formatBits, formatBytes } from "@/lib/utils";
import type { MikrotikDevice, InterfaceInfo, TrafficDataPoint } from "@/lib/types";
import { ArrowUpRight, ArrowDownRight, Activity, Zap } from "lucide-react";

export default function TrafficPage() {
  const [devices, setDevices] = useState<MikrotikDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [interfaces, setInterfaces] = useState<InterfaceInfo[]>([]);
  const [trafficHistory, setTrafficHistory] = useState<TrafficDataPoint[]>([]);
  const apiRef = useRef<MikrotikAPI | null>(null);

  // Fetch devices list from API
  useEffect(() => {
    MikrotikAPI.getDevices()
      .then((devs) => {
        setDevices(devs);
        if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0].id);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (selectedDevice) {
      apiRef.current = new MikrotikAPI(selectedDevice);
      setTrafficHistory([]);
      setInterfaces([]);
    }
  }, [selectedDevice]);

  const fetchData = useCallback(async () => {
    if (!apiRef.current) return;
    try {
      const newInterfaces = await apiRef.current.getInterfaces();
      setInterfaces(newInterfaces);
      setTrafficHistory(apiRef.current.addTrafficPoint(newInterfaces));
    } catch (err) {
      console.error("Failed to fetch:", err);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 2000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalRx = interfaces.reduce((s, i) => s + i.rxRate, 0);
  const totalTx = interfaces.reduce((s, i) => s + i.txRate, 0);

  return (
    <>
      <Header title="Traffic" subtitle="Bandwidth monitoring per interface" />

      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <DeviceSelector
            devices={devices}
            selectedId={selectedDevice}
            onSelect={setSelectedDevice}
          />
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <SummaryCard
            icon={<ArrowDownRight className="w-4 h-4 text-[#0A84FF]" />}
            iconBg="bg-[#0A84FF]/10"
            label="Total Download"
            value={formatBits(totalRx)}
            subvalue={`${formatBytes(totalRx / 8)}/s`}
            color="#0A84FF"
          />
          <SummaryCard
            icon={<ArrowUpRight className="w-4 h-4 text-[#30D158]" />}
            iconBg="bg-[#30D158]/10"
            label="Total Upload"
            value={formatBits(totalTx)}
            subvalue={`${formatBytes(totalTx / 8)}/s`}
            color="#30D158"
          />
          <SummaryCard
            icon={<Zap className="w-4 h-4 text-[#AF52DE]" />}
            iconBg="bg-[#AF52DE]/10"
            label="Combined"
            value={formatBits(totalRx + totalTx)}
            subvalue="Total throughput"
            color="#AF52DE"
          />
        </div>

        {/* Main Chart */}
        <TrafficChart data={trafficHistory} title="Aggregate Traffic" height={280} />

        {/* Per-Interface Cards */}
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">
            Per-Interface Breakdown
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {interfaces.filter(i => i.type !== "pppoe-summary").map((iface, idx) => (
              <div key={iface.name} className="card p-4 animate-fade-in" style={{ animationDelay: `${idx * 0.05}s` }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-[var(--text-tertiary)]" />
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">{iface.name}</span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">{iface.type}</span>
                  </div>
                  <span className={`badge ${iface.status === "up" ? "badge-green" : "badge-red"}`}>
                    {iface.status}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <ArrowDownRight className="w-3.5 h-3.5 text-[#0A84FF]" />
                    <div>
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-medium">RX</p>
                      <p className="text-[16px] font-semibold text-[#0A84FF] font-mono">{formatBits(iface.rxRate)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#30D158]" />
                    <div>
                      <p className="text-[10px] text-[var(--text-tertiary)] uppercase font-medium">TX</p>
                      <p className="text-[16px] font-semibold text-[#30D158] font-mono">{formatBits(iface.txRate)}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div>
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-0.5">
                      <span>RX Util</span>
                      <span>{Math.round((iface.rxRate / 1000000000) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#0A84FF]/15 overflow-hidden">
                      <div
                        className="h-full bg-[#0A84FF] rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, (iface.rxRate / 1000000000) * 100)}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-[var(--text-tertiary)] mb-0.5">
                      <span>TX Util</span>
                      <span>{Math.round((iface.txRate / 1000000000) * 100)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-[#30D158]/15 overflow-hidden">
                      <div
                        className="h-full bg-[#30D158] rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, (iface.txRate / 1000000000) * 100)}%` }}
                      />
                    </div>
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

function SummaryCard({ icon, iconBg, label, value, subvalue, color }: {
  icon: React.ReactNode; iconBg: string; label: string; value: string; subvalue: string; color: string;
}) {
  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center gap-2 mb-2">
        <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>{icon}</div>
        <span className="text-[13px] font-medium text-[var(--text-secondary)]">{label}</span>
      </div>
      <p className="text-[24px] font-semibold font-mono" style={{ color }}>{value}</p>
      <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">{subvalue}</p>
    </div>
  );
}
