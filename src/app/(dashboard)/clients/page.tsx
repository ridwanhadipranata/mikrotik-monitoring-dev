"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/Header";
import { DeviceSelector } from "@/components/dashboard/DeviceSelector";
import { MikrotikAPI } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { MikrotikDevice } from "@/lib/types";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  Search,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle,
  Ban,
  Clock,
  X,
  Filter,
} from "lucide-react";

interface Client {
  name: string;
  target: string;
  ips: string[];
  maxUpload: string;
  maxDownload: string;
  rateUpload: number;
  rateDownload: number;
  totalUpload: number;
  totalDownload: number;
  disabled: boolean;
  comment: string;
  alive: boolean;
  latency: number | null;
}

interface StatusLogEntry {
  status: "up" | "down" | "disabled";
  changedAt: number;
}
type StatusLog = Record<string, StatusLogEntry>;

interface ClientsData {
  total: number;
  up: number;
  down: number;
  disabled: number;
  clients: Client[];
  groups: { down: Client[]; up: Client[]; disabled: Client[] };
}

type StatusFilter = "all" | "down" | "up" | "disabled";

export default function ClientsPage() {
  const [devices, setDevices] = useState<MikrotikDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>("");
  const [data, setData] = useState<ClientsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [expandedDown, setExpandedDown] = useState(true);
  const [expandedUp, setExpandedUp] = useState(true);
  const [expandedDisabled, setExpandedDisabled] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [lastPing, setLastPing] = useState<Date | null>(null);
  const [statusLog, setStatusLog] = useState<StatusLog>({});
  const [switching, setSwitching] = useState(false);

  // Load status log from server (background bot)
  useEffect(() => {
    const fetchStatusLog = async () => {
      try {
        const res = await fetch("/monitoring/api/status-log", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (data.current) {
            const mapped: StatusLog = {};
            for (const [key, entry] of Object.entries(data.current) as any) {
              const parts = key.split(":");
              const name = parts.slice(1).join(":");
              if (name) {
                if (!mapped[name] || entry.changedAt > mapped[name].changedAt) {
                  mapped[name] = { status: entry.status, changedAt: entry.changedAt };
                }
              }
            }
            setStatusLog(mapped);
          }
        }
      } catch {}
    };
    fetchStatusLog();
    const interval = setInterval(fetchStatusLog, 15000);
    return () => clearInterval(interval);
  }, []);

  // Fetch devices list on mount
  useEffect(() => {
    MikrotikAPI.getDevices()
      .then((devs) => {
        setDevices(devs);
        if (devs.length > 0 && !selectedDevice) setSelectedDevice(devs[0].id);
      })
      .catch(console.error);
  }, []);

  const fetchData = useCallback(async (deviceId?: string) => {
    const dev = deviceId || selectedDevice;
    if (!dev) return;
    try {
      // Fetch queue data + bot status in parallel
      const [queueRes, statusRes] = await Promise.all([
        fetch(`/monitoring/api/clients?device=${dev}`, { cache: "no-store" }),
        fetch(`/monitoring/api/status-log`, { cache: "no-store" }),
      ]);

      if (!queueRes.ok) {
        const err = await queueRes.json().catch(() => ({ error: "Gagal memuat data" }));
        throw new Error(err.error || `HTTP ${queueRes.status}`);
      }

      const json = await queueRes.json();

      // Merge bot status to set alive state immediately
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        const botStatus = statusData.current || {};
        const updatedClients = json.clients.map((c: Client) => {
          // Try multiple key formats: "deviceId:clientName", "clientName"
          const key1 = `${dev}:${c.name}`;
          const key2 = c.name;
          const entry = botStatus[key1] || botStatus[key2];
          if (entry) {
            const alive = entry.status === "up";
            return { ...c, alive };
          }
          return c;
        });
        const up = updatedClients.filter((c: Client) => c.alive && !c.disabled);
        const down = updatedClients.filter((c: Client) => !c.alive && !c.disabled);
        const disabled = updatedClients.filter((c: Client) => c.disabled);
        setData({
          total: updatedClients.length,
          up: up.length,
          down: down.length,
          disabled: disabled.length,
          clients: [...down, ...up, ...disabled],
          groups: { down, up, disabled },
        });
      } else {
        setData(json);
      }

      setError(null);
      setLastRefresh(new Date());
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
      setSwitching(false);
    }
  }, [selectedDevice]);

  const fetchPing = useCallback(async (deviceId?: string) => {
    const dev = deviceId || selectedDevice;
    if (!dev) return;
    try {
      const res = await fetch(`/monitoring/api/clients/ping?device=${dev}`, { cache: "no-store" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.results) {
        setLastPing(new Date());
        setData(prev => {
          if (!prev) return prev;
          const pingResults = json.results;
          const updatedClients = prev.clients.map(c => {
            const clientPings = c.ips.map(ip => pingResults[ip] || { ip, alive: false, latency: null });
            const alive = clientPings.some(p => p.alive);
            const latency = clientPings.find(p => p.alive)?.latency ?? null;
            return { ...c, alive, latency, pings: clientPings };
          });
          const up = updatedClients.filter(c => c.alive && !c.disabled);
          const down = updatedClients.filter(c => !c.alive && !c.disabled);
          const disabled = updatedClients.filter(c => c.disabled);
          return {
            total: updatedClients.length,
            up: up.length,
            down: down.length,
            disabled: disabled.length,
            clients: [...down, ...up, ...disabled],
            groups: { down, up, disabled },
          };
        });
      }
    } catch (err) {
      console.error("Ping fetch error:", err);
    }
  }, [selectedDevice]);

  // Reset data when switching device
  useEffect(() => {
    if (selectedDevice) {
      setData(null);
      setError(null);
      setLoading(true);
      setSwitching(true);
      const dev = selectedDevice;
      const controller = new AbortController();

      // Full initial load
      fetchData(dev).then(() => fetchPing(dev));
      // Queue data: every 5s (lightweight)
      const queueInterval = setInterval(() => {
        if (!controller.signal.aborted) fetchData(dev);
      }, 5000);
      // Ping data: every 60s (heavy)
      const pingInterval = setInterval(() => {
        if (!controller.signal.aborted) fetchPing(dev);
      }, 60000);
      return () => {
        controller.abort();
        clearInterval(queueInterval);
        clearInterval(pingInterval);
      };
    }
  }, [selectedDevice]);

  // Auto-expand groups when searching
  useEffect(() => {
    if (search) {
      setExpandedDown(true);
      setExpandedUp(true);
      setExpandedDisabled(true);
    }
  }, [search]);

  const filterClient = (c: Client) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      c.name.toLowerCase().includes(q) ||
      c.target.includes(q) ||
      c.ips.some(ip => ip.includes(q)) ||
      c.comment.toLowerCase().includes(q);
    const matchStatus = statusFilter === "all" ||
      (statusFilter === "down" && !c.alive && !c.disabled) ||
      (statusFilter === "up" && c.alive && !c.disabled) ||
      (statusFilter === "disabled" && c.disabled);
    return matchSearch && matchStatus;
  };

  const down = (data?.groups.down || []).filter(filterClient);
  const up = (data?.groups.up || []).filter(filterClient);
  const disabled = (data?.groups.disabled || []).filter(filterClient);
  const totalFiltered = down.length + up.length + disabled.length;

  if (!data && loading) {
    return (
      <>
        <Header title="Status Client" subtitle="Monitoring semua client" />
        <div className="flex items-center justify-center h-[calc(100vh-80px)]">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-[var(--blue)] border-t-transparent rounded-full animate-spin" />
            <p className="text-[14px] text-[var(--text-secondary)]">Memuat data client...</p>
          </div>
        </div>
      </>
    );
  }

  if (error && !data) {
    return (
      <>
        <Header title="Status Client" subtitle="Monitoring semua client" />
        <div className="flex items-center justify-center h-[calc(100vh-80px)] p-4">
          <div className="card p-8 max-w-md text-center">
            <AlertTriangle className="w-10 h-10 text-[var(--red)] mx-auto mb-3" />
            <p className="text-[16px] font-semibold text-[var(--text-primary)] mb-2">Gagal Memuat</p>
            <p className="text-[13px] text-[var(--text-secondary)] mb-4">{error}</p>
            <button onClick={() => fetchData(selectedDevice)} className="btn btn-primary">Coba Lagi</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header
        title="Status Client"
        subtitle={devices.find(d => d.id === selectedDevice)?.name || "Monitoring semua client"}
      />

      <div className="p-4 md:p-6 space-y-5">
        {/* Device Selector - Always visible */}
        <div className="flex items-center gap-3">
          <span className="text-[13px] text-[var(--text-tertiary)] font-medium">Router:</span>
          <DeviceSelector
            devices={devices}
            selectedId={selectedDevice}
            onSelect={setSelectedDevice}
          />
          {data && (
            <span className="text-[12px] text-[var(--text-tertiary)]">
              {data.total} client terdaftar
              {lastPing && <> · Ping {lastPing.toLocaleTimeString("en-US", { hour12: false })}</>}
            </span>
          )}
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <SummaryCard icon={<Wifi className="w-4 h-4" />} label="Total" value={data?.total || 0} color="var(--blue)" />
          <SummaryCard icon={<CheckCircle className="w-4 h-4" />} label="Online" value={data?.up || 0} color="var(--green)" />
          <SummaryCard icon={<WifiOff className="w-4 h-4" />} label="Offline" value={data?.down || 0} color="var(--red)" />
          <SummaryCard icon={<Ban className="w-4 h-4" />} label="Disabled" value={data?.disabled || 0} color="var(--text-tertiary)" />
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-quaternary)]" />
            <input
              type="text"
              placeholder="Cari nama client, IP, atau komentar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="!pl-10 !pr-10 !py-2.5 text-[14px]"
              autoFocus
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2">
                <X className="w-4 h-4 text-[var(--text-quaternary)] hover:text-[var(--text-primary)]" />
              </button>
            )}
          </div>

          {/* Status Filter Tabs */}
          <div className="flex items-center gap-1 p-1 bg-[var(--bg-input)] rounded-xl">
            {([
              { key: "all", label: "Semua", icon: <Filter className="w-3.5 h-3.5" /> },
              { key: "down", label: "Down", icon: <WifiOff className="w-3.5 h-3.5" />, color: "var(--red)" },
              { key: "up", label: "Up", icon: <CheckCircle className="w-3.5 h-3.5" />, color: "var(--green)" },
              { key: "disabled", label: "Off", icon: <Ban className="w-3.5 h-3.5" />, color: "var(--text-tertiary)" },
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all",
                  statusFilter === tab.key
                    ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Refresh */}
          <div className="flex items-center gap-3">
            {lastRefresh && (
              <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {lastRefresh.toLocaleTimeString("en-US", { hour12: false })}
              </span>
            )}
            <button onClick={() => { fetchData(selectedDevice); fetchPing(selectedDevice); }} disabled={loading || switching} className="btn btn-secondary text-[13px]">
              <RefreshCw className={cn("w-3.5 h-3.5", (loading || switching) && "animate-spin")} />
              {switching ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Search Result Info */}
        {search && (
          <div className="flex items-center gap-2 px-1">
            <Search className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
            <span className="text-[13px] text-[var(--text-secondary)]">
              Ditemukan <strong className="text-[var(--text-primary)]">{totalFiltered}</strong> client
              {search && <> untuk &quot;<strong className="text-[var(--blue)]">{search}</strong>&quot;</>}
            </span>
            {totalFiltered === 0 && (
              <span className="text-[13px] text-[var(--text-tertiary)]">— coba kata kunci lain</span>
            )}
          </div>
        )}

        {/* DOWN Group */}
        {(statusFilter === "all" || statusFilter === "down") && down.length > 0 && (
          <ClientGroup
            title="Client Offline"
            subtitle={`${down.length} client tidak merespon`}
            icon={<WifiOff className="w-4 h-4 text-[var(--red)]" />}
            badge="badge-red"
            clients={down}
            expanded={expandedDown}
            onToggle={() => setExpandedDown(!expandedDown)}
            highlight
            search={search}
            statusLog={statusLog}
          />
        )}

        {/* UP Group */}
        {(statusFilter === "all" || statusFilter === "up") && up.length > 0 && (
          <ClientGroup
            title="Client Online"
            subtitle={`${up.length} client aktif`}
            icon={<CheckCircle className="w-4 h-4 text-[var(--green)]" />}
            badge="badge-green"
            clients={up}
            expanded={expandedUp}
            onToggle={() => setExpandedUp(!expandedUp)}
            search={search}
            statusLog={statusLog}
          />
        )}

        {/* Disabled Group */}
        {(statusFilter === "all" || statusFilter === "disabled") && disabled.length > 0 && (
          <ClientGroup
            title="Client Disabled"
            subtitle={`${disabled.length} client dinonaktifkan`}
            icon={<Ban className="w-4 h-4 text-[var(--text-tertiary)]" />}
            badge=""
            clients={disabled}
            expanded={expandedDisabled}
            onToggle={() => setExpandedDisabled(!expandedDisabled)}
            search={search}
            statusLog={statusLog}
          />
        )}

        {/* Empty State */}
        {totalFiltered === 0 && (
          <div className="card p-8 text-center">
            <Search className="w-8 h-8 text-[var(--text-quaternary)] mx-auto mb-3" />
            <p className="text-[14px] text-[var(--text-secondary)]">Tidak ada client yang cocok</p>
            {search && (
              <button onClick={() => { setSearch(""); setStatusFilter("all"); }} className="btn btn-ghost text-[13px] mt-3">
                Reset filter
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="card p-4 anim-in">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}12`, color }}>{icon}</div>
        <span className="text-[12px] font-medium text-[var(--text-secondary)]">{label}</span>
      </div>
      <p className="text-[24px] font-bold tabular-nums" style={{ color }}>{value}</p>
    </div>
  );
}

function ClientGroup({
  title, subtitle, icon, badge, clients, expanded, onToggle, highlight = false, search = "", statusLog = {},
}: {
  title: string; subtitle: string; icon: React.ReactNode; badge: string;
  clients: Client[]; expanded: boolean; onToggle: () => void; highlight?: boolean; search?: string; statusLog?: StatusLog;
}) {
  return (
    <div className={cn("card overflow-hidden anim-in", highlight && "ring-1 ring-[var(--red)]/20")}>
      <button onClick={onToggle} className="w-full flex items-center justify-between px-4 py-3 hover:bg-[var(--bg-hover)] transition-colors text-left">
        <div className="flex items-center gap-3">
          {icon}
          <div>
            <p className="text-[14px] font-semibold text-[var(--text-primary)]">{title}</p>
            <p className="text-[12px] text-[var(--text-tertiary)]">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {badge && <span className={cn("badge", badge)}>{clients.length}</span>}
          {expanded ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
        </div>
      </button>

      {expanded && (
        <div className="overflow-x-auto">
          <table className="data-table" style={{ tableLayout: "fixed", width: "100%", minWidth: "800px" }}>
            <colgroup>
              <col style={{ width: "110px" }} />
              <col style={{ width: "24%" }} />
              <col style={{ width: "22%" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "75px" }} />
              <col style={{ width: "75px" }} />
            </colgroup>
            <thead>
              <tr>
                <th>Status</th>
                <th>Nama Client</th>
                <th>Target</th>
                <th className="text-right">Latency</th>
                <th className="text-right">Upload</th>
                <th className="text-right">Download</th>
                <th className="text-right">Total TX</th>
                <th className="text-right">Total RX</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c, idx) => (
                <tr key={`${c.name}-${idx}`} className="anim-in" style={{ animationDelay: `${Math.min(idx * 0.02, 0.5)}s` }}>
                  <td>
                    <div className="flex flex-col gap-0.5">
                      <div className="flex items-center gap-2">
                        <div className={cn("dot", c.alive ? "dot-green" : c.disabled ? "bg-[var(--text-quaternary)]" : "dot-red")} />
                        <span className={cn("text-[12px] font-semibold", c.alive ? "text-[var(--green)]" : c.disabled ? "text-[var(--text-tertiary)]" : "text-[var(--red)]")}>
                          {c.disabled ? "OFF" : c.alive ? "UP" : "DOWN"}
                        </span>
                      </div>
                      {statusLog[c.name] && (
                        <span className="text-[10px] text-[var(--text-quaternary)] ml-5 whitespace-nowrap">
                          {new Date(statusLog[c.name].changedAt).toLocaleString("id-ID", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="truncate" title={c.name}>
                    <div className="overflow-hidden">
                      <p className="text-[13px] font-medium text-[var(--text-primary)] truncate">
                        <Highlight text={c.name} query={search} />
                      </p>
                      {c.comment && <p className="text-[11px] text-[var(--text-tertiary)] truncate"><Highlight text={c.comment} query={search} /></p>}
                    </div>
                  </td>
                  <td className="truncate" title={c.target}>
                    <span className="text-[13px] font-mono text-[var(--text-secondary)] truncate block">
                      <Highlight text={c.target} query={search} />
                    </span>
                  </td>
                  <td className="text-right">
                    {c.latency !== null ? (
                      <span className={cn("text-[13px] font-mono font-medium",
                        c.latency < 10 ? "text-[var(--green)]" : c.latency < 50 ? "text-[var(--orange)]" : "text-[var(--red)]"
                      )}>
                        {c.latency.toFixed(1)}ms
                      </span>
                    ) : (
                      <span className="text-[13px] text-[var(--text-quaternary)]">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    {c.rateUpload > 0 ? (
                      <span className="text-[12px] font-mono font-semibold text-[var(--green)]">
                        {formatSpeed(c.rateUpload.toString())}
                      </span>
                    ) : (
                      <span className="text-[12px] text-[var(--text-quaternary)]">—</span>
                    )}
                  </td>
                  <td className="text-right">
                    {c.rateDownload > 0 ? (
                      <span className="text-[12px] font-mono font-semibold text-[var(--blue)]">
                        {formatSpeed(c.rateDownload.toString())}
                      </span>
                    ) : (
                      <span className="text-[12px] text-[var(--text-quaternary)]">—</span>
                    )}
                  </td>
                  <td className="text-right ">
                    <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
                      {formatBytes(c.totalUpload)}
                    </span>
                  </td>
                  <td className="text-right ">
                    <span className="text-[11px] font-mono text-[var(--text-tertiary)]">
                      {formatBytes(c.totalDownload)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[var(--yellow-soft,rgba(255,204,0,0.2))] text-[var(--text-primary)] rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

function formatSpeed(bps: string): string {
  const n = parseInt(bps);
  if (!n || isNaN(n)) return "—";
  if (n >= 1000000000) return `${(n / 1000000000).toFixed(1)} Gbps`;
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)} Mbps`;
  if (n >= 1000) return `${(n / 1000).toFixed(0)} Kbps`;
  return `${n} bps`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return "—";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
