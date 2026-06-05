"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { authFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Bell, BellRing, WifiOff, CheckCircle, AlertTriangle, Info,
  RefreshCw, Loader2, Trash2,
} from "lucide-react";

interface NotifEntry {
  id: string;
  deviceId: string;
  deviceName: string;
  host: string;
  type: string;
  message: string;
  timestamp: number;
}

interface NotifData {
  pending: NotifEntry[];
  history: NotifEntry[];
}

export default function AlertsPage() {
  const [notifData, setNotifData] = useState<NotifData>({ pending: [], history: [] });
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await authFetch("/monitoring/api/notifications", { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setNotifData(data);
    } catch {} finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, [fetchNotifications]);

  const clearPending = async () => {
    setClearing(true);
    try {
      await authFetch("/monitoring/api/notifications/clear", { method: "POST" });
      await fetchNotifications();
    } catch {} finally {
      setClearing(false);
    }
  };

  const getIcon = (type: string) => {
    if (type === "recovered") return <CheckCircle className="w-5 h-5" />;
    if (type === "still_failing") return <AlertTriangle className="w-5 h-5" />;
    return <WifiOff className="w-5 h-5" />;
  };

  const getColor = (type: string) => {
    if (type === "recovered") return { bg: "bg-[#34C759]/10", text: "text-[#34C759]", badge: "badge-green", label: "PULIH" };
    if (type === "still_failing") return { bg: "bg-[#FF9500]/10", text: "text-[#FF9500]", badge: "badge-orange", label: "MASALAH" };
    return { bg: "bg-[#FF3B30]/10", text: "text-[#FF3B30]", badge: "badge-red", label: "GAGAL" };
  };

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60000) return "Baru saja";
    if (diff < 3600000) return `${Math.floor(diff / 60000)} menit lalu`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} jam lalu`;
    return new Date(ts).toLocaleDateString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  const allEntries = [...notifData.pending, ...notifData.history].sort((a, b) => b.timestamp - a.timestamp);
  const pendingCount = notifData.pending.length;

  return (
    <>
      <Header title="Router Alerts" subtitle={`${pendingCount} alert aktif`} />

      <div className="p-4 md:p-6 space-y-4">
        {/* Info */}
        <div className="card p-4 bg-[#0A84FF]/5 border-[#0A84FF]/20">
          <p className="text-[13px] text-[#0A84FF]">
            🔔 Notifikasi otomatis saat router gagal dihubungi via MikroTik API. Data diperbarui setiap 15 detik.
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-[var(--text-tertiary)]">
            {allEntries.length} total alert tercatat
          </p>
          <div className="flex gap-2">
            {pendingCount > 0 && (
              <button onClick={clearPending} disabled={clearing} className="btn btn-secondary text-[12px] !py-1.5 !px-3">
                <Trash2 className="w-3.5 h-3.5" />
                Hapus {pendingCount} Alert
              </button>
            )}
            <button onClick={fetchNotifications} disabled={loading} className="btn btn-secondary text-[12px] !py-1.5 !px-3">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
              Refresh
            </button>
          </div>
        </div>

        {/* Alert List */}
        {loading && allEntries.length === 0 ? (
          <div className="card p-12 flex flex-col items-center gap-3">
            <Loader2 className="w-8 h-8 text-[var(--text-tertiary)] animate-spin" />
            <p className="text-[14px] text-[var(--text-tertiary)]">Memuat...</p>
          </div>
        ) : allEntries.length === 0 ? (
          <div className="card p-12 flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-2xl bg-[#34C759]/10 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-[#34C759]" />
            </div>
            <p className="text-[15px] font-medium text-[var(--text-primary)]">Semua Router Normal</p>
            <p className="text-[13px] text-[var(--text-tertiary)]">Tidak ada masalah koneksi tercatat</p>
          </div>
        ) : (
          <div className="space-y-2">
            {allEntries.map((entry, idx) => {
              const color = getColor(entry.type);
              const isPending = notifData.pending.find(p => p.id === entry.id);
              return (
                <div
                  key={entry.id}
                  className={cn(
                    "card p-4 animate-fade-in flex items-start gap-4",
                    isPending && "ring-1 ring-[#FF3B30]/30 bg-[#FF3B30]/[0.02]"
                  )}
                  style={{ animationDelay: `${idx * 0.03}s` }}
                >
                  <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", color.bg, color.text)}>
                    {getIcon(entry.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={cn("badge", color.badge)}>{color.label}</span>
                      <span className="text-[12px] font-medium text-[var(--text-primary)]">{entry.deviceName}</span>
                      <span className="text-[12px] text-[var(--text-tertiary)]">— {entry.host}</span>
                      <span className="text-[11px] text-[var(--text-tertiary)] ml-auto shrink-0">{formatTime(entry.timestamp)}</span>
                    </div>
                    <p className="text-[13px] text-[var(--text-secondary)]">{entry.message}</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
