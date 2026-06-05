"use client";

import { useState, useEffect } from "react";
import { BillingAPI } from "@/lib/billing-api";
import type { BillingDeviceInfo } from "@/lib/billing-types";
import { Router, ChevronDown, Check, Users, AlertCircle, Building2 } from "lucide-react";

interface DeviceSelectorProps {
  value: string;
  onChange: (deviceId: string) => void;
}

export default function DeviceSelector({ value, onChange }: DeviceSelectorProps) {
  const [devices, setDevices] = useState<BillingDeviceInfo[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    BillingAPI.getDevices().then(d => {
      setDevices(d);
      if (d.length === 0) return;
      // Auto-select: first load, or saved value is invalid
      const saved = typeof window !== "undefined" ? localStorage.getItem("***") : null;
      const isValidSaved = saved && d.some(dev => dev.id === saved);
      if (!value && !isValidSaved) {
        onChange(d[0].id);
      } else if (value && !d.some(dev => dev.id === value)) {
        // Current value not in list → reset to first
        onChange(d[0].id);
      }
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const selected = devices.find(d => d.id === value);

  if (loading) return <div className="skeleton h-9 w-48 rounded-xl" />;
  if (devices.length === 0) return null;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-xl
                   bg-[var(--bg-card)] border border-[var(--border)]
                   text-[13px] font-semibold text-[var(--text-primary)]
                   hover:border-[var(--blue)]/30 hover:shadow-[var(--shadow-sm)]
                   transition-all duration-200 active:scale-[0.98]"
      >
        <Router className="w-4 h-4 text-[var(--blue)]" />
        <span className="max-w-[200px] truncate">{selected?.name || "Pilih Router"}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-1.5 z-50 w-[300px]
                          bg-[var(--bg-card)] border border-[var(--border)]
                          rounded-xl shadow-[var(--shadow-xl)] overflow-hidden anim-slide">
            {devices.map(d => {
              const isSelected = d.id === value;
              return (
                <button
                  key={d.id}
                  onClick={() => { onChange(d.id); setOpen(false); }}
                  className={`w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors
                    ${isSelected ? "bg-[var(--blue-soft)]" : "hover:bg-[var(--bg-hover)]"}`}
                >
                  <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0
                    ${isSelected ? "bg-[var(--blue)]" : "bg-[var(--bg-input)]"}`}>
                    {isSelected ? <Check className="w-4 h-4 text-white" /> : <Router className="w-4 h-4 text-[var(--text-tertiary)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${isSelected ? "text-[var(--blue)]" : "text-[var(--text-primary)]"}`}>
                      {d.name}
                    </p>
                    <div className="flex items-center gap-3 mt-0.5">
                      {d.tenant && (
                        <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> {d.tenant.name}
                        </span>
                      )}
                      <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                        <Users className="w-3 h-3" /> {d.activeCount}/{d.customerCount} pelanggan
                      </span>
                      {d.unpaidCount > 0 && (
                        <span className="text-[11px] text-[var(--red)] flex items-center gap-1">
                          <AlertCircle className="w-3 h-3" /> {d.unpaidCount} belum bayar
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
