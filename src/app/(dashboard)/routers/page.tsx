"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { authFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Plus,
  Server,
  Wifi,
  WifiOff,
  MoreHorizontal,
  Edit3,
  Trash2,
  Search,
  X,
  Activity,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Shield,
  Network,
  Clock,
} from "lucide-react";

interface Router {
  id: string;
  name: string;
  host: string;
  port: number;
  wanInterface: string | null;
  isActive: boolean;
  status: string;
  latency: number;
  lastConnected: string | null;
  createdAt: string;
  tenant?: {
    id: string;
    name: string;
    slug: string;
  };
}

export default function RoutersPage() {
  const [routers, setRouters] = useState<Router[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editRouter, setEditRouter] = useState<Router | null>(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRouters();
    const interval = setInterval(fetchRouters, 10000);
    return () => clearInterval(interval);
  }, []);

  async function fetchRouters() {
    try {
      const res = await authFetch("/monitoring/api/routers");
      if (res.ok) {
        const data = await res.json();
        setRouters(data);
      }
    } catch (err) {
      console.error("Failed to fetch routers:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Hapus router "${name}"? Data billing tetap tersimpan.`)) return;
    try {
      const res = await authFetch(`/monitoring/api/routers/${id}`, { method: "DELETE" });
      if (res.ok) fetchRouters();
    } catch (err) {
      console.error("Failed to delete router:", err);
    }
  }

  const filtered = routers.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      r.host.includes(search)
  );

  return (
    <>
      <Header title="Routers" subtitle={`${routers.length} Mikrotik routers connected`} />

      <div className="p-4 md:p-6 space-y-4">
        {/* Actions Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-sm w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              type="text"
              placeholder="Search routers..."
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
          <button onClick={() => { setEditRouter(null); setShowModal(true); }} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Add Router
          </button>
        </div>

        {/* Router Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--blue)]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((router, idx) => (
              <RouterCard
                key={router.id}
                router={router}
                index={idx}
                onEdit={() => { setEditRouter(router); setShowModal(true); }}
                onDelete={() => handleDelete(router.id, router.name)}
              />
            ))}

            {/* Add Router Card */}
            <button
              onClick={() => { setEditRouter(null); setShowModal(true); }}
              className="card p-6 flex flex-col items-center justify-center gap-3 min-h-[200px] border-2 border-dashed border-[var(--border)] hover:border-[var(--blue)] transition-colors cursor-pointer group"
            >
              <div className="w-12 h-12 rounded-2xl bg-[var(--bg-base)] flex items-center justify-center group-hover:bg-[var(--blue)]/10 transition-colors">
                <Plus className="w-6 h-6 text-[var(--text-tertiary)] group-hover:text-[var(--blue)] transition-colors" />
              </div>
              <div>
                <p className="text-[14px] font-medium text-[var(--text-secondary)] group-hover:text-[var(--blue)]">
                  Add New Router
                </p>
                <p className="text-[12px] text-[var(--text-tertiary)]">
                  Connect a Mikrotik router
                </p>
              </div>
            </button>
          </div>
        )}
      </div>

      {showModal && (
        <RouterModal
          router={editRouter}
          onClose={() => { setShowModal(false); setEditRouter(null); }}
          onSave={() => { setShowModal(false); setEditRouter(null); fetchRouters(); }}
        />
      )}
    </>
  );
}

function RouterCard({
  router,
  index,
  onEdit,
  onDelete,
}: {
  router: Router;
  index: number;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isConnected = router.status === "connected";
  const isConnecting = router.status === "connecting";

  return (
    <div className="card p-5 animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "w-11 h-11 rounded-xl flex items-center justify-center",
              isConnected
                ? "bg-[#34C759]/10 text-[#34C759]"
                : isConnecting
                ? "bg-[#FF9500]/10 text-[#FF9500]"
                : "bg-[#FF3B30]/10 text-[#FF3B30]"
            )}
          >
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {router.name}
            </h3>
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  "status-dot",
                  isConnected ? "online" : isConnecting ? "connecting" : "offline"
                )}
              />
              <span className="text-[12px] text-[var(--text-tertiary)]">
                {isConnected ? "Connected" : isConnecting ? "Connecting..." : "Disconnected"}
              </span>
            </div>
          </div>
        </div>
        <button className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-base)] transition-colors">
          <MoreHorizontal className="w-4 h-4 text-[var(--text-tertiary)]" />
        </button>
      </div>

      {/* Info */}
      <div className="space-y-2.5 mb-4">
        {router.tenant && (
          <InfoRow label="Tenant" value={router.tenant.name} />
        )}
        <InfoRow label="IP Address" value={router.host} mono />
        <InfoRow label="API Port" value={String(router.port)} mono />
        {router.wanInterface && <InfoRow label="WAN Interface" value={router.wanInterface} mono />}
        {isConnected && router.latency > 0 && (
          <InfoRow label="Latency" value={`${router.latency}ms`} />
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button onClick={onEdit} className="btn btn-secondary flex-1 text-[13px] !py-2">
          <Edit3 className="w-3.5 h-3.5" />
          Edit
        </button>
        <button onClick={onDelete} className="btn btn-secondary flex-1 text-[13px] !py-2 !text-[#FF3B30] hover:!bg-[#FF3B30]/10">
          <Trash2 className="w-3.5 h-3.5" />
          Delete
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

function RouterModal({
  router,
  onClose,
  onSave,
}: {
  router: Router | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(router?.name || "");
  const [host, setHost] = useState(router?.host || "");
  const [port, setPort] = useState(String(router?.port || 8728));
  const [user, setUser] = useState("admin");
  const [password, setPassword] = useState("");
  const [wanInterface, setWanInterface] = useState(router?.wanInterface || "");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"success" | "error" | null>(null);
  const [testInfo, setTestInfo] = useState<{ identity?: string; version?: string } | null>(null);
  const [interfaces, setInterfaces] = useState<{ name: string; type: string; running: boolean }[]>([]);

  const isEdit = !!router;

  async function handleTest() {
    if (!host) {
      setError("IP Address is required");
      return;
    }

    setTesting(true);
    setError("");
    setTestResult(null);
    setTestInfo(null);
    setInterfaces([]);

    try {
      const res = await authFetch("/monitoring/api/routers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ host, port: Number(port), user, password }),
      });

      const data = await res.json();

      if (data.success) {
        setTestResult("success");
        setTestInfo(data.info);
        if (data.interfaces && data.interfaces.length > 0) {
          setInterfaces(data.interfaces);
          // Auto-select WAN interface if not set
          if (!wanInterface) {
            const wan = data.interfaces.find((i: any) => i.type === "ether" && i.running);
            if (wan) setWanInterface(wan.name);
          }
        }
      } else {
        setTestResult("error");
        setError(data.error || "Connection failed");
      }
    } catch (err: any) {
      setTestResult("error");
      setError(err.message || "Connection failed");
    } finally {
      setTesting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !host) {
      setError("Name and host are required");
      return;
    }

    // For new routers, require test first
    if (!isEdit && testResult !== "success") {
      setError("Silakan test koneksi terlebih dahulu");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body: any = { name, host, port: Number(port), user, wanInterface };
      if (password) body.password = password;

      const url = isEdit ? `/monitoring/api/routers/${router.id}` : "/monitoring/api/routers";
      const method = isEdit ? "PUT" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save router");
      }

      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-lg p-6 animate-scale-in !rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">
              {isEdit ? "Edit Router" : "Add Router"}
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
              {isEdit ? "Update router connection details" : "Connect a new Mikrotik router"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-base)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Name */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              Router Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Main Office Router"
              required
            />
          </div>

          {/* Host & Port */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                IP Address / Host
              </label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.1"
                className="font-mono"
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                API Port
              </label>
              <input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="8728"
                className="font-mono"
              />
            </div>
          </div>

          {/* Username & Password */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Username
              </label>
              <input
                type="text"
                value={user}
                onChange={(e) => setUser(e.target.value)}
                placeholder="admin"
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Password {isEdit && <span className="text-[var(--text-tertiary)]">(kosongkan jika tidak berubah)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit ? "••••••" : "Enter password"}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4 text-[var(--text-tertiary)]" />
                  ) : (
                    <Eye className="w-4 h-4 text-[var(--text-tertiary)]" />
                  )}
                </button>
              </div>
            </div>
          </div>

          {/* WAN Interface */}
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
              WAN Interface <span className="text-[var(--text-tertiary)]">(untuk monitoring traffic)</span>
            </label>
            {interfaces.length > 0 ? (
              <select
                value={wanInterface}
                onChange={(e) => setWanInterface(e.target.value)}
              >
                <option value="">-- Pilih Interface --</option>
                {interfaces.map((iface) => (
                  <option key={iface.name} value={iface.name}>
                    {iface.name} ({iface.type}) {iface.running ? "🟢" : "🔴"}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                value={wanInterface}
                onChange={(e) => setWanInterface(e.target.value)}
                placeholder="Test koneksi dulu untuk pilih interface"
                className="font-mono"
                disabled={!isEdit && testResult !== "success"}
              />
            )}
          </div>

          {/* Test Result */}
          {testResult === "success" && testInfo && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#34C759]/10 text-[#34C759] text-[13px]">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <div>
                <p className="font-medium">Koneksi berhasil!</p>
                <p className="text-[12px] opacity-80">{testInfo.identity} — RouterOS {testInfo.version}</p>
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-[13px]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            {!isEdit && (
              <button type="button" onClick={handleTest} disabled={testing || !host} className="btn btn-secondary flex-1">
                {testing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : testResult === "success" ? (
                  <CheckCircle2 className="w-4 h-4 text-[#34C759]" />
                ) : (
                  <Wifi className="w-4 h-4" />
                )}
                {testing ? "Testing..." : testResult === "success" ? "Connected" : "Test Connection"}
              </button>
            )}
            <button type="submit" disabled={saving || (!isEdit && testResult !== "success")} className="btn btn-primary flex-1">
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Server className="w-4 h-4" />
              )}
              {saving ? "Saving..." : isEdit ? "Update Router" : "Save Router"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
