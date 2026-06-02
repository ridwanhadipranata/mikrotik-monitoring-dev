"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth";
import { useBillingDevice } from "@/lib/use-billing-device";
import DeviceSelector from "@/components/DeviceSelector";
import {
  ArrowLeft, Database, Download, Upload, RefreshCw,
  CheckCircle2, AlertCircle, HardDrive, FileJson,
  Package, Users, FileText, Loader2, Info,
} from "lucide-react";
import BillingNav from "@/components/BillingNav";

const fmtRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
const fmtSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.startsWith("/monitoring") ? "/monitoring" : "";
}

interface BackupInfo {
  deviceId?: string;
  packages: number;
  customers: number;
  customersActive: number;
  invoices: number;
  invoicesPaid: number;
  invoicesUnpaid: number;
  totalRevenue: number;
  diskUsage: { packages: number; customers: number; invoices: number };
}

interface DeviceInfo { id: string; name: string; }

export default function BackupPage() {
  const { device, setDevice } = useBillingDevice();
  const [info, setInfo] = useState<BackupInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [restoreMode, setRestoreMode] = useState<"replace" | "merge">("merge");
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingData, setPendingData] = useState<any>(null);
  const [targetDevice, setTargetDevice] = useState<string>("");
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Load device list for target selector
  useEffect(() => {
    const base = getApiBase();
    authFetch(`${base}/api/billing/devices`).then(r => r.json()).then(setDevices).catch(() => {});
  }, []);

  const currentDeviceName = devices.find(d => d.id === device)?.name || device;

  const loadInfo = () => {
    if (!device) return;
    setLoading(true);
    const base = getApiBase();
    authFetch(`${base}/api/backup/info?deviceId=${encodeURIComponent(device)}`)
      .then(r => r.json())
      .then(setInfo)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadInfo(); }, [device]);

  // ── Backup ──────────────────────────────────────────────────
  const handleBackup = async () => {
    const base = getApiBase();
    try {
      const res = await authFetch(`${base}/api/backup?deviceId=${encodeURIComponent(device)}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const safeName = currentDeviceName.replace(/[^a-zA-Z0-9]/g, "-").slice(0, 30);
      a.download = `mikromon-${safeName}-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMsg({ type: "success", text: `Backup ${currentDeviceName} berhasil diunduh!` });
    } catch (e: any) {
      setMsg({ type: "error", text: "Gagal backup: " + e.message });
    }
  };

  // ── Restore ─────────────────────────────────────────────────
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (!data.data?.packages || !data.data?.customers || !data.data?.invoices) {
          setMsg({ type: "error", text: "File backup tidak valid!" });
          return;
        }
        setPendingData(data);
        setTargetDevice(device);
        setShowConfirm(true);
        setMsg(null);
      } catch {
        setMsg({ type: "error", text: "File bukan JSON yang valid!" });
      }
    };
    reader.readAsText(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const confirmRestore = async () => {
    if (!pendingData) return;
    setRestoring(true);
    setMsg(null);
    setShowConfirm(false);

    const base = getApiBase();
    try {
      const res = await authFetch(`${base}/api/backup/restore`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data: pendingData.data,
          mode: restoreMode,
          targetDevice: targetDevice || device,
        }),
      });
      const result = await res.json();
      if (result.success) {
        const targetName = devices.find(d => d.id === (targetDevice || device))?.name || targetDevice || device;
        setMsg({ type: "success", text: `${result.message} → ${targetName} — ${result.restored.packages} paket, ${result.restored.customers} pelanggan, ${result.restored.invoices} tagihan` });
        loadInfo();
      } else {
        setMsg({ type: "error", text: result.error || "Restore gagal" });
      }
    } catch (e: any) {
      setMsg({ type: "error", text: "Error: " + e.message });
    }
    setRestoring(false);
    setPendingData(null);
  };

  return (
    <div className="p-5 sm:p-8 space-y-6 max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/billing" className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.025em]">Backup & Restore</h1>
            <p className="text-[13px] text-[var(--text-tertiary)]">Kelola data backup per router</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <BillingNav current="/billing/backup" />
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4 text-[var(--text-tertiary)]" />
          <DeviceSelector value={device} onChange={setDevice} />
        </div>
      </div>

      {/* Messages */}
      {msg && (
        <div className={`flex items-start gap-3 p-4 rounded-xl ${
          msg.type === "success" ? "bg-[var(--green-soft)]" : "bg-[var(--red-soft)]"
        }`}>
          {msg.type === "success" ? (
            <CheckCircle2 className="w-5 h-5 text-[var(--green)] flex-shrink-0 mt-0.5" />
          ) : (
            <AlertCircle className="w-5 h-5 text-[var(--red)] flex-shrink-0 mt-0.5" />
          )}
          <p className={`text-[13px] font-medium ${msg.type === "success" ? "text-[var(--green)]" : "text-[var(--red)]"}`}>
            {msg.text}
          </p>
        </div>
      )}

      {/* Confirm Modal */}
      {showConfirm && pendingData && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowConfirm(false)}>
          <div className="card w-full max-w-[440px] p-6 !rounded-2xl shadow-[var(--shadow-xl)] anim-scale" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-[var(--orange-soft)] flex items-center justify-center">
                <AlertCircle className="w-5 h-5 text-[var(--orange)]" />
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Konfirmasi Restore</h2>
                <p className="text-[12px] text-[var(--text-tertiary)]">Data dari file backup akan diproses</p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--bg-input)] mb-4 space-y-1 text-[12px]">
              <p>📦 Paket: <strong>{pendingData.meta?.packages || pendingData.data.packages.length}</strong></p>
              <p>👥 Pelanggan: <strong>{pendingData.meta?.customers || pendingData.data.customers.length}</strong></p>
              <p>📄 Tagihan: <strong>{pendingData.meta?.invoices || pendingData.data.invoices.length}</strong></p>
              <p>📅 Backup: <strong>{new Date(pendingData.timestamp).toLocaleString("id-ID")}</strong></p>
              {pendingData.deviceName && <p>📡 Router Asal: <strong>{pendingData.deviceName}</strong></p>}
            </div>

            {/* Target Device */}
            <div className="mb-4 space-y-2">
              <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Restore Ke Router</label>
              <select
                value={targetDevice}
                onChange={e => setTargetDevice(e.target.value)}
                className="input text-[13px]"
              >
                {devices.map(d => (
                  <option key={d.id} value={d.id}>{d.name}{d.id === device ? " (aktif)" : ""}</option>
                ))}
              </select>
              <p className="text-[11px] text-[var(--text-quaternary)]">
                {pendingData.deviceId && pendingData.deviceId !== targetDevice
                  ? `Backup dari: ${pendingData.deviceName || pendingData.deviceId}`
                  : "Data akan di-restore ke router yang dipilih"}
              </p>
            </div>

            <div className="mb-4 space-y-2">
              <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Mode Restore</label>
              <div className="flex gap-2">
                <button
                  onClick={() => setRestoreMode("merge")}
                  className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                    restoreMode === "merge"
                      ? "border-[var(--blue)] bg-[var(--blue-soft)]"
                      : "border-[var(--border)] hover:border-[var(--blue)]/30"
                  }`}
                >
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">Merge</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Tambah data baru, skip yang sudah ada</p>
                </button>
                <button
                  onClick={() => setRestoreMode("replace")}
                  className={`flex-1 p-3 rounded-xl border text-left transition-all ${
                    restoreMode === "replace"
                      ? "border-[var(--red)] bg-[var(--red-soft)]"
                      : "border-[var(--border)] hover:border-[var(--red)]/30"
                  }`}
                >
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">Replace</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">Timpa data router ini</p>
                </button>
              </div>
            </div>

            {restoreMode === "replace" && (
              <div className="mb-4 p-3 rounded-xl bg-[var(--red-soft)] text-[12px] text-[var(--red)] font-medium">
                ⚠️ Mode Replace akan menghapus SEMUA data router tujuan dan mengganti dengan data backup!
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setShowConfirm(false); setPendingData(null); }} className="btn btn-secondary flex-1 text-[13px]">Batal</button>
              <button onClick={confirmRestore} disabled={restoring} className="btn btn-primary flex-1 text-[13px]">
                {restoring ? <><Loader2 className="w-4 h-4 animate-spin" /> Restore...</> : <><RefreshCw className="w-4 h-4" /> Restore</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Database Info */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5 text-[var(--blue)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Database Router</h2>
          </div>
          <span className="text-[12px] text-[var(--text-tertiary)] bg-[var(--bg-input)] px-2.5 py-1 rounded-full font-medium">
            {currentDeviceName || "—"}
          </span>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-20 rounded-xl" />)}</div>
        ) : info ? (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3 rounded-xl bg-[var(--bg-input)] space-y-1">
                <div className="flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-[var(--purple)]" />
                  <span className="text-[11px] text-[var(--text-tertiary)] font-medium">Paket</span>
                </div>
                <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{info.packages}</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-input)] space-y-1">
                <div className="flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[var(--blue)]" />
                  <span className="text-[11px] text-[var(--text-tertiary)] font-medium">Pelanggan</span>
                </div>
                <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{info.customers}</p>
                <p className="text-[10px] text-[var(--green)]">{info.customersActive} aktif</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-input)] space-y-1">
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-[var(--orange)]" />
                  <span className="text-[11px] text-[var(--text-tertiary)] font-medium">Tagihan</span>
                </div>
                <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">{info.invoices}</p>
                <p className="text-[10px] text-[var(--green)]">{info.invoicesPaid} lunas · {info.invoicesUnpaid} belum</p>
              </div>
              <div className="p-3 rounded-xl bg-[var(--bg-input)] space-y-1">
                <div className="flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                  <span className="text-[11px] text-[var(--text-tertiary)] font-medium">Ukuran</span>
                </div>
                <p className="text-[20px] font-bold text-[var(--text-primary)] tabular-nums">
                  {fmtSize(info.diskUsage.packages + info.diskUsage.customers + info.diskUsage.invoices)}
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-[var(--green-soft)] flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--green)]">Total Revenue Router Ini</span>
              <span className="text-[18px] font-bold text-[var(--green)] tabular-nums">{fmtRp(info.totalRevenue)}</span>
            </div>
          </>
        ) : null}
      </div>

      {/* Backup */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Download className="w-5 h-5 text-[var(--green)]" />
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Backup Router Ini</h2>
        </div>
        <p className="text-[13px] text-[var(--text-tertiary)]">
          Download semua data router <strong>{currentDeviceName}</strong> (paket, pelanggan, tagihan) dalam satu file JSON.
        </p>
        <button onClick={handleBackup} className="btn btn-primary text-[13px] w-full sm:w-auto">
          <Download className="w-4 h-4" /> Download Backup
        </button>
      </div>

      {/* Restore */}
      <div className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Upload className="w-5 h-5 text-[var(--blue)]" />
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Restore ke Router</h2>
        </div>
        <p className="text-[13px] text-[var(--text-tertiary)]">
          Upload file backup (.json) untuk mengembalikan data. Bisa restore ke router manapun, termasuk dari backup router lain.
        </p>

        <div className="flex flex-col sm:flex-row gap-3">
          <input ref={fileRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
          <button onClick={() => fileRef.current?.click()} disabled={restoring} className="btn btn-secondary text-[13px] w-full sm:w-auto">
            <FileJson className="w-4 h-4" /> Pilih File Backup
          </button>
        </div>

        <div className="p-3 rounded-xl bg-[var(--bg-input)] space-y-2">
          <div className="flex items-center gap-2">
            <Info className="w-4 h-4 text-[var(--text-tertiary)]" />
            <span className="text-[12px] font-semibold text-[var(--text-secondary)]">Tips Backup Per Router</span>
          </div>
          <ul className="text-[12px] text-[var(--text-tertiary)] space-y-1 ml-6 list-disc">
            <li>Setiap router punya data backup terpisah</li>
            <li>Backup rutin setiap minggu untuk keamanan data</li>
            <li>Mode <strong>Merge</strong> aman — data yang sudah ada tidak akan ditimpa</li>
            <li>Mode <strong>Replace</strong> akan menghapus semua data router tujuan</li>
            <li>Bisa restore dari router lain — pilih target router saat konfirmasi</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
