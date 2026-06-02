"use client";

import {
  RefreshCw,
  Terminal,
  Download,
  Power,
  Shield,
} from "lucide-react";

const actions = [
  { icon: <RefreshCw className="w-4 h-4" />, label: "Refresh", color: "#0A84FF" },
  { icon: <Terminal className="w-4 h-4" />, label: "Terminal", color: "#AF52DE" },
  { icon: <Download className="w-4 h-4" />, label: "Backup", color: "#5AC8FA" },
  { icon: <Shield className="w-4 h-4" />, label: "Firewall", color: "#FF9500" },
  { icon: <Power className="w-4 h-4" />, label: "Reboot", color: "#FF3B30" },
];

export function QuickActions() {
  return (
    <div className="card p-4 animate-fade-in">
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">
        Quick Actions
      </h3>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            className="btn btn-secondary flex items-center gap-1.5 text-[13px] !py-2 !px-3 hover:scale-[1.02] active:scale-[0.98] transition-transform"
          >
            <span style={{ color: action.color }}>{action.icon}</span>
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
