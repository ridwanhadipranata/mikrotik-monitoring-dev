"use client";

import type { SystemResource, MikrotikDevice } from "@/lib/types";
import { formatUptime } from "@/lib/utils";
import {
  Cpu,
  HardDrive,
  Zap,
  Clock,
  Server,
  Code,
  Thermometer,
} from "lucide-react";

interface DeviceInfoCardProps {
  device: MikrotikDevice;
  resource: SystemResource;
}

export function DeviceInfoCard({ device, resource }: DeviceInfoCardProps) {
  const infoItems = [
    { icon: <Server className="w-3.5 h-3.5" />, label: "Board", value: resource.boardName },
    { icon: <Code className="w-3.5 h-3.5" />, label: "RouterOS", value: resource.version },
    { icon: <Cpu className="w-3.5 h-3.5" />, label: "Arch", value: resource.architecture },
    { icon: <Zap className="w-3.5 h-3.5" />, label: "CPU", value: `${resource.cpuCount}x ${resource.cpuFrequency} MHz` },
    { icon: <Clock className="w-3.5 h-3.5" />, label: "Uptime", value: formatUptime(typeof resource.uptime === 'number' ? resource.uptime : 0) },
    { icon: <HardDrive className="w-3.5 h-3.5" />, label: "IP", value: device.host },
  ];

  return (
    <div className="card p-4 animate-fade-in">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0A84FF] to-[#AF52DE] flex items-center justify-center shadow-lg shadow-[#0A84FF]/20">
          <Server className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            {device.name}
          </h3>
          <div className="flex items-center gap-1.5">
            <span className={`status-dot ${device.status === "online" ? "online" : "offline"}`} />
            <span className="text-[12px] text-[var(--text-tertiary)]">
              {device.status === "online" ? "Connected" : "Disconnected"}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {infoItems.map((item) => (
          <div key={item.label} className="flex items-center gap-2">
            <div className="text-[var(--text-tertiary)]">{item.icon}</div>
            <div>
              <p className="text-[10px] text-[var(--text-tertiary)] uppercase tracking-wider font-medium">
                {item.label}
              </p>
              <p className="text-[13px] font-medium text-[var(--text-primary)]">
                {item.value}
              </p>
            </div>
          </div>
        ))}
      </div>

      {resource.temperature !== null && (
        <div className="mt-3 pt-3 border-t border-[var(--border)] flex items-center gap-2">
          <Thermometer className="w-3.5 h-3.5 text-[#FF9500]" />
          <span className="text-[12px] text-[var(--text-secondary)]">Temperature:</span>
          <span className="text-[13px] font-medium text-[#FF9500]">{resource.temperature}°C</span>
        </div>
      )}
    </div>
  );
}
