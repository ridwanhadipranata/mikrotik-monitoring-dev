"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { MikrotikDevice } from "@/lib/types";
import { ChevronDown, Check, Server } from "lucide-react";

interface DeviceSelectorProps {
  devices: MikrotikDevice[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function DeviceSelector({
  devices,
  selectedId,
  onSelect,
}: DeviceSelectorProps) {
  const [open, setOpen] = useState(false);
  const selected = devices.find((d) => d.id === selectedId);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="btn btn-secondary flex items-center gap-2 min-w-[200px] justify-between"
      >
        <div className="flex items-center gap-2">
          <div className={cn("status-dot", selected?.status === "online" ? "online" : "offline")} />
          <span className="text-[14px] truncate">{selected?.name || "Select Device"}</span>
        </div>
        <ChevronDown
          className={cn(
            "w-4 h-4 text-[var(--text-tertiary)] transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1 w-full min-w-[280px] z-50 card shadow-lg animate-slide-down overflow-hidden !p-0">
            {devices.map((device) => (
              <button
                key={device.id}
                onClick={() => {
                  onSelect(device.id);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-base)] transition-colors text-left",
                  device.id === selectedId && "bg-[var(--sidebar-active)]"
                )}
              >
                <div
                  className={cn(
                    "w-7 h-7 rounded-lg flex items-center justify-center",
                    device.status === "online"
                      ? "bg-[#34C759]/10 text-[#34C759]"
                      : "bg-[#FF3B30]/10 text-[#FF3B30]"
                  )}
                >
                  <Server className="w-3.5 h-3.5" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                    {device.name}
                  </p>
                  <p className="text-[11px] text-[var(--text-tertiary)] font-mono">
                    {device.host}:{device.port}
                  </p>
                </div>
                {device.id === selectedId && (
                  <Check className="w-4 h-4 text-[#0A84FF]" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
