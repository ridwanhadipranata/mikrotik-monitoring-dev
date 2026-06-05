"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { MikrotikAPI } from "@/lib/api";
import type { MikrotikDevice } from "@/lib/types";
import { cn, timeAgo } from "@/lib/utils";
import {
  Plus,
  Server,
  Wifi,
  WifiOff,
  MoreHorizontal,
  Edit3,
  Trash2,
  ExternalLink,
  Search,
  X,
  Activity,
  Loader2,
} from "lucide-react";

export default function DevicesPage() {
  const [devices, setDevices] = useState<MikrotikDevice[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    MikrotikAPI.getDevices()
      .then(setDevices)
      .catch(console.error);
  }, []);

  const filtered = devices.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.host.includes(search)
  );

  return (
    <>
      <Header title="Devices" subtitle={`${devices.length} Mikrotik devices`} />

      <div className="p-4 md:p-6 space-y-4">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search devices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!pl-10 !pr-10"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-[var(--text-tertiary)]" />
              </button>
            )}
          </div>
          <button onClick={() => setShowAdd(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Add Device
          </button>
        </div>

        {/* Device Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((device, idx) => (
            <DeviceCard key={device.id} device={device} index={idx} />
          ))}

          {/* Add Device Card */}
          <button
            onClick={() => setShowAdd(true)}
            className="card p-6 flex flex-col items-center justify-center gap-3 min-h-[200px] border-2 border-dashed border-[var(--border)] hover:border-[var(--blue)] transition-colors cursor-pointer group"
          >
            <div className="w-12 h-12 rounded-2xl bg-[var(--bg-base)] flex items-center justify-center group-hover:bg-[var(--blue)]/10 transition-colors">
              <Plus className="w-6 h-6 text-[var(--text-tertiary)] group-hover:text-[var(--blue)] transition-colors" />
            </div>
            <div>
              <p className="text-[14px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--blue)]">
                Add New Device
              </p>
              <p className="text-[12px] text-[var(--text-tertiary)]">
                Connect a Mikrotik router
              </p>
            </div>
          </button>
        </div>

        {showAdd && <AddDeviceModal onClose={() => setShowAdd(false)} />}
      </div>
    </>
  );
}

function DeviceCard({ device, index }: { device: MikrotikDevice; index: number }) {
  return (
    <div className="card p-5 animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center",
              device.status === "online"
                ? "bg-[#34C759]/10 text-[#34C759]"
                : "bg-[#FF3B30]/10 text-[#FF3B30]"
            )}
          >
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {device.name}
            </h3>
            <div className="flex items-center gap-1.5">
              <span className={cn("status-dot", device.status === "online" ? "online" : "offline")} />
              <span className="text-[12px] text-[var(--text-tertiary)]">
                {device.status === "online" ? "Online" : "Offline"}
              </span>
            </div>
          </div>
        </div>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-base)] transition-colors">
          <MoreHorizontal className="w-4 h-4 text-[var(--text-tertiary)]" />
        </button>
      </div>

      <div className="space-y-2.5 mb-4">
        <InfoRow label="IP Address" value={device.host} mono />
        <InfoRow label="API Port" value={String(device.port)} mono />
        <InfoRow label="Last Seen" value={device.lastSeen ? timeAgo(device.lastSeen) : "Never"} />
      </div>

      <div className="flex gap-2">
        <button className="btn btn-secondary flex-1 text-[13px] !py-2">
          <Edit3 className="w-3.5 h-3.5" />
          Edit
        </button>
        <button className="btn btn-secondary flex-1 text-[13px] !py-2">
          <Activity className="w-3.5 h-3.5" />
          Monitor
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[12px] text-[var(--text-tertiary)]">{label}</span>
      <span className={cn("text-[13px] text-[var(--text-primary)]", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

function AddDeviceModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("8728");
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !host.trim()) {
      setError("Nama dan IP address wajib diisi");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/monitoring/api/routers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          host: host.trim(),
          port: Number(port) || 8728,
          user: username.trim() || "admin",
          password,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menambahkan device");
      onClose();
      window.location.reload();
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-md p-6 animate-scale-in !rounded-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">Add Device</h2>
          <button onClick={onClose} aria-label="Tutup" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-base)] transition-colors">
            <X className="w-5 h-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-[var(--red-soft)] text-[13px] text-[var(--red)] font-medium mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Device Name</label>
            <input type="text" placeholder="e.g. Main Office Router" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">IP Address</label>
              <input type="text" placeholder="192.168.1.1" className="font-mono" value={host} onChange={e => setHost(e.target.value)} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Port</label>
              <input type="number" placeholder="8728" className="font-mono" value={port} onChange={e => setPort(e.target.value)} min={1} max={65535} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Username</label>
              <input type="text" placeholder="admin" value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Password</label>
              <input type="password" placeholder="••••••" value={password} onChange={e => setPassword(e.target.value)} />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Menyimpan...</> : <><Wifi className="w-4 h-4" /> Test & Save</>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
