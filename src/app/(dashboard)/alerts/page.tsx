"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";
import {
  Bell, BellRing, Plus, Cpu, MemoryStick, HardDrive, WifiOff,
  Mail, MessageCircle, Trash2, AlertTriangle, CheckCircle, Info,
} from "lucide-react";

interface Alert {
  id: string;
  type: "cpu" | "ram" | "disk" | "interface";
  device: string;
  message: string;
  severity: "warning" | "critical" | "info";
  time: string;
  acknowledged: boolean;
}

const mockAlerts: Alert[] = [
  { id: "1", type: "cpu", device: "RO:Core Router Jtpr", message: "CPU usage exceeded 80% threshold (currently 87%)", severity: "warning", time: "2 min ago", acknowledged: false },
  { id: "2", type: "interface", device: "RO:Core Router Jtpr", message: "Interface ether4 went down", severity: "critical", time: "15 min ago", acknowledged: false },
  { id: "3", type: "ram", device: "x86 INTEL BOTU-C612", message: "Memory usage above 90% for 5 minutes", severity: "critical", time: "1 hour ago", acknowledged: true },
  { id: "4", type: "disk", device: "RO:Core Router Jtpr", message: "Disk usage reached 75%", severity: "info", time: "3 hours ago", acknowledged: true },
];

const alertRules = [
  { id: "1", name: "High CPU", icon: <Cpu className="w-4 h-4" />, condition: "CPU > 80% for 2 min", enabled: true, color: "#FF9500" },
  { id: "2", name: "High Memory", icon: <MemoryStick className="w-4 h-4" />, condition: "RAM > 85% for 5 min", enabled: true, color: "#FF3B30" },
  { id: "3", name: "Disk Space", icon: <HardDrive className="w-4 h-4" />, condition: "Disk > 90%", enabled: false, color: "#FFCC00" },
  { id: "4", name: "Interface Down", icon: <WifiOff className="w-4 h-4" />, condition: "Any interface goes down", enabled: true, color: "#FF3B30" },
];

export default function AlertsPage() {
  const [alerts, setAlerts] = useState(mockAlerts);
  const [tab, setTab] = useState<"alerts" | "rules">("alerts");

  const unacknowledged = alerts.filter((a) => !a.acknowledged);

  return (
    <>
      <Header title="Alerts" subtitle={`${unacknowledged.length} unacknowledged alerts`} />

      <div className="p-4 md:p-6 space-y-5">
        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 bg-[var(--bg-base)] rounded-xl w-fit">
          {(["alerts", "rules"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "px-4 py-2 rounded-lg text-[14px] font-medium transition-all",
                tab === t
                  ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                  : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
              )}
            >
              <div className="flex items-center gap-2">
                {t === "alerts" ? <BellRing className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                {t.charAt(0).toUpperCase() + t.slice(1)}
                {t === "alerts" && unacknowledged.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-[#FF3B30] text-white text-[10px] font-bold">
                    {unacknowledged.length}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>

        {tab === "alerts" ? (
          <div className="space-y-3">
            {alerts.map((alert, idx) => (
              <div
                key={alert.id}
                className={cn(
                  "card p-4 animate-fade-in flex items-start gap-4",
                  alert.acknowledged && "opacity-60"
                )}
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0",
                    alert.severity === "critical" && "bg-[#FF3B30]/10 text-[#FF3B30]",
                    alert.severity === "warning" && "bg-[#FF9500]/10 text-[#FF9500]",
                    alert.severity === "info" && "bg-[#0A84FF]/10 text-[#0A84FF]"
                  )}
                >
                  {alert.severity === "critical" ? <AlertTriangle className="w-5 h-5" /> :
                   alert.severity === "warning" ? <BellRing className="w-5 h-5" /> :
                   <Info className="w-5 h-5" />}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={cn(
                      "badge",
                      alert.severity === "critical" && "badge-red",
                      alert.severity === "warning" && "badge-orange",
                      alert.severity === "info" && "badge-blue"
                    )}>
                      {alert.severity}
                    </span>
                    <span className="text-[12px] text-[var(--text-tertiary)]">{alert.time}</span>
                  </div>
                  <p className="text-[14px] text-[var(--text-primary)] mb-0.5">{alert.message}</p>
                  <p className="text-[12px] text-[var(--text-tertiary)]">{alert.device}</p>
                </div>

                {!alert.acknowledged && (
                  <button
                    onClick={() => setAlerts(prev => prev.map(a => a.id === alert.id ? { ...a, acknowledged: true } : a))}
                    className="btn btn-secondary text-[12px] !py-1.5 !px-3 shrink-0"
                  >
                    <CheckCircle className="w-3.5 h-3.5" />
                    Ack
                  </button>
                )}
              </div>
            ))}

            {alerts.length === 0 && (
              <div className="card p-12 flex flex-col items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-[#34C759]/10 flex items-center justify-center">
                  <CheckCircle className="w-8 h-8 text-[#34C759]" />
                </div>
                <p className="text-[15px] font-medium text-[var(--text-primary)]">All Clear</p>
                <p className="text-[13px] text-[var(--text-tertiary)]">No alerts at this time</p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-[var(--text-tertiary)]">Configure when alerts should trigger</p>
              <button className="btn btn-primary text-[13px]">
                <Plus className="w-4 h-4" />
                Add Rule
              </button>
            </div>

            <div className="space-y-3">
              {alertRules.map((rule, idx) => (
                <div key={rule.id} className="card p-4 animate-fade-in flex items-center gap-4" style={{ animationDelay: `${idx * 0.05}s` }}>
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ backgroundColor: `${rule.color}15`, color: rule.color }}
                  >
                    {rule.icon}
                  </div>
                  <div className="flex-1">
                    <p className="text-[14px] font-medium text-[var(--text-primary)]">{rule.name}</p>
                    <p className="text-[12px] text-[var(--text-tertiary)]">{rule.condition}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-[var(--text-tertiary)]" />
                      <MessageCircle className="w-4 h-4 text-[var(--text-tertiary)]" />
                    </div>
                    <button
                      className={cn(
                        "w-11 h-6 rounded-full transition-all relative",
                        rule.enabled ? "bg-[#34C759]" : "bg-[var(--bg-input)]"
                      )}
                    >
                      <span className={cn(
                        "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
                        rule.enabled && "translate-x-5"
                      )} />
                    </button>
                    <button className="text-[var(--text-tertiary)] hover:text-[#FF3B30] transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
