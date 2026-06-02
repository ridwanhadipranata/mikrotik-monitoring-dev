"use client";

import { formatBits, formatBytes } from "@/lib/utils";
import type { InterfaceInfo } from "@/lib/types";
import {
  ArrowUpRight,
  ArrowDownRight,
  Wifi,
  Cable,
  Network,
  Globe,
} from "lucide-react";

interface InterfaceTableProps {
  interfaces: InterfaceInfo[];
}

function getInterfaceIcon(type: string) {
  switch (type) {
    case "wlan": return <Wifi className="w-4 h-4" />;
    case "ether": return <Cable className="w-4 h-4" />;
    case "bridge": return <Network className="w-4 h-4" />;
    default: return <Globe className="w-4 h-4" />;
  }
}

export function InterfaceTable({ interfaces }: InterfaceTableProps) {
  return (
    <div className="card overflow-hidden animate-fade-in">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center justify-between">
        <div>
          <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
            Interfaces
          </h3>
          <p className="text-[12px] text-[var(--text-tertiary)]">
            {interfaces.filter((i) => i.status === "up").length} of{" "}
            {interfaces.length} active
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <th>Interface</th>
              <th>Status</th>
              <th>Speed</th>
              <th className="text-right">RX Rate</th>
              <th className="text-right">TX Rate</th>
              <th className="text-right hidden md:table-cell">Total RX</th>
              <th className="text-right hidden md:table-cell">Total TX</th>
            </tr>
          </thead>
          <tbody>
            {interfaces.map((iface) => (
              <tr key={iface.name}>
                <td>
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                        iface.status === "up"
                          ? "bg-[#0A84FF]/10 text-[#0A84FF]"
                          : "bg-[var(--bg-input)] text-[var(--text-tertiary)]"
                      }`}
                    >
                      {getInterfaceIcon(iface.type)}
                    </div>
                    <div>
                      <p className="text-[13px] font-medium text-[var(--text-primary)]">
                        {iface.name}
                      </p>
                      {iface.macAddress && (
                        <p className="text-[11px] text-[var(--text-tertiary)] font-mono">
                          {iface.macAddress}
                        </p>
                      )}
                    </div>
                  </div>
                </td>
                <td>
                  <span
                    className={`badge ${
                      iface.status === "up" ? "badge-green" : "badge-red"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        iface.status === "up" ? "bg-[#34C759]" : "bg-[#FF3B30]"
                      }`}
                    />
                    {iface.status === "up" ? "Up" : "Down"}
                  </span>
                </td>
                <td className="text-[13px] text-[var(--text-secondary)]">
                  {iface.speed || "—"}
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ArrowDownRight className="w-3.5 h-3.5 text-[#0A84FF]" />
                    <span className="text-[13px] font-mono font-medium text-[#0A84FF]">
                      {formatBits(iface.rxRate)}
                    </span>
                  </div>
                </td>
                <td className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <ArrowUpRight className="w-3.5 h-3.5 text-[#30D158]" />
                    <span className="text-[13px] font-mono font-medium text-[#30D158]">
                      {formatBits(iface.txRate)}
                    </span>
                  </div>
                </td>
                <td className="text-right text-[13px] font-mono text-[var(--text-secondary)] hidden md:table-cell">
                  {formatBytes(iface.rxBytes)}
                </td>
                <td className="text-right text-[13px] font-mono text-[var(--text-secondary)] hidden md:table-cell">
                  {formatBytes(iface.txBytes)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
