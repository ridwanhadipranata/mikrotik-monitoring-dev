"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BillingAPI } from "@/lib/billing-api";
import { authFetch } from "@/lib/auth";
import { useBillingDevice } from "@/lib/use-billing-device";
import type { BillingInvoice, BillingCustomer, BillingPackage } from "@/lib/billing-types";
import {
  ArrowLeft, MessageCircle, Wifi, WifiOff, QrCode, Send,
  Users, CheckCircle2, XCircle, Loader2, RefreshCw, StopCircle,
  Phone, Clock, Radio, Receipt,
} from "lucide-react";

import BillingNav from "@/components/BillingNav";
const DeviceSelector = dynamic(() => import("@/components/DeviceSelector"), { ssr: false });

const fmtRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

interface WAStatus {
  status: string;
  number: string | null;
  qr: string | null;
  error: string | null;
  queue: number;
  broadcast: { sent: number; failed: number; total: number; current: string | null };
}

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.startsWith("/monitoring") ? "/monitoring" : "";
}

async function waFetch(path: string, options: RequestInit = {}) {
  const base = getApiBase();
  const res = await authFetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  return res.json();
}

export default function WhatsAppPage() {
  const { device, setDevice } = useBillingDevice();
  const [waStatus, setWaStatus] = useState<WAStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [broadcastDelay, setBroadcastDelay] = useState(15);
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Poll WA status
  const fetchStatus = () => waFetch("/api/wa/status").then(setWaStatus).catch(() => {});
  useEffect(() => {
    fetchStatus();
    intervalRef.current = setInterval(fetchStatus, 3000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  // Load billing data
  useEffect(() => {
    if (!device) return;
    setLoading(true);
    Promise.all([
      BillingAPI.getCustomers(device).catch(() => []),
      BillingAPI.getPackages(device).catch(() => []),
      BillingAPI.getInvoices(device).catch(() => []),
    ]).then(([c, p, i]) => { setCustomers(c); setPackages(p); setInvoices(i); setLoading(false); });
  }, [device]);

  const connected = waStatus?.status === "connected";
  const broadcast = waStatus?.broadcast;
  const isBroadcasting = broadcast && broadcast.total > 0 && (broadcast.current !== null || broadcast.sent + broadcast.failed < broadcast.total);

  const unpaidInvoices = invoices.filter(i => i.status === "unpaid");

  // Group by customer
  const unpaidByCustomer = new Map<string, BillingInvoice[]>();
  for (const inv of unpaidInvoices) {
    const existing = unpaidByCustomer.get(inv.customerId) || [];
    existing.push(inv);
    unpaidByCustomer.set(inv.customerId, existing);
  }

  const customersWithUnpaid = customers.filter(c =>
    c.status === "active" && unpaidByCustomer.has(c.id) && c.phone
  );
  const totalUnpaid = unpaidInvoices.reduce((s, i) => s + (i.totalAmount || i.amount), 0);

  const handleConnect = async () => {
    await waFetch("/api/wa/connect", { method: "POST" });
    setMsg("Menunggu QR code...");
  };

  const handleDisconnect = async () => {
    if (!confirm("Putuskan koneksi WhatsApp?")) return; // TODO: replace with custom modal
    await waFetch("/api/wa/disconnect", { method: "POST" });
    setMsg("WhatsApp diputus");
  };

  const handleBroadcast = async () => {
    if (broadcastDelay < 10) {
      setMsg("Delay minimal 10 detik untuk hindari ban WhatsApp");
      return;
    }
    if (!confirm(`Kirim rekap tagihan belum bayar ke ${customersWithUnpaid.length} pelanggan?`)) return; // TODO: replace with custom modal
    setSending(true);
    setMsg("");
    try {
      const result = await waFetch("/api/wa/broadcast", {
        method: "POST",
        body: JSON.stringify({ deviceId: device, delay: broadcastDelay }),
      });
      setMsg(result.message);
    } catch (e: any) {
      setMsg("Error: " + e.message);
    }
    setSending(false);
  };

  const handleStop = async () => {
    await waFetch("/api/wa/broadcast-stop", { method: "POST" });
    setMsg("Broadcast dihentikan");
  };

  return (
    <div className="p-5 sm:p-8 space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/billing" className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.025em]">WhatsApp Gateway</h1>
            <p className="text-[13px] text-[var(--text-tertiary)]">Kirim tagihan via WhatsApp otomatis</p>
          </div>
        </div>
        <DeviceSelector value={device} onChange={setDevice} />
      </div>

      <BillingNav current="/billing/whatsapp" />

      {/* Status Card */}
      <div className={`card p-5 ${connected ? "border-[#25D366]/30 bg-[#25D366]/[0.03]" : "border-[var(--red)]/20 bg-[var(--red)]/[0.02]"}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${connected ? "bg-[#25D366]/10" : "bg-[var(--red-soft)]"}`}>
              {connected ? (
                <MessageCircle className="w-6 h-6 text-[#25D366]" />
              ) : (
                <WifiOff className="w-6 h-6 text-[var(--red)]" />
              )}
            </div>
            <div>
              <p className="text-[15px] font-bold text-[var(--text-primary)]">
                {connected ? "Terhubung" : waStatus?.status === "connecting" ? "Menunggu QR..." : "Terputus"}
              </p>
              {connected && waStatus?.number && (
                <p className="text-[13px] text-[#25D366] font-medium">+{waStatus.number}</p>
              )}
              {!connected && waStatus?.status !== "connecting" && (
                <p className="text-[13px] text-[var(--text-tertiary)]">Hubungkan WhatsApp untuk mulai</p>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {!connected ? (
              <button onClick={handleConnect} className="btn btn-primary text-[13px]">
                <Wifi className="w-4 h-4" /> Hubungkan
              </button>
            ) : (
              <button onClick={handleDisconnect} className="btn btn-secondary text-[13px] text-[var(--red)]">
                <WifiOff className="w-4 h-4" /> Putus
              </button>
            )}
          </div>
        </div>

        {/* QR Code — only render data: URLs to prevent SSRF/script injection */}
        {waStatus?.status === "connecting" && waStatus.qr && waStatus.qr.startsWith("data:") && (
          <div className="mt-5 pt-5 border-t border-[var(--border-light)] flex flex-col items-center gap-3">
            <div className="p-3 bg-white rounded-2xl shadow-[var(--shadow-md)]">
              <img src={waStatus.qr} alt="QR Code" className="w-[220px] h-[220px]" />
            </div>
            <div className="text-center">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">Scan QR Code</p>
              <p className="text-[12px] text-[var(--text-tertiary)] mt-1">Buka WhatsApp di HP → Settings → Linked Devices → Link a Device</p>
            </div>
          </div>
        )}
      </div>

      {/* Broadcast Section */}
      {connected && (
        <div className="card p-5 space-y-5">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-[var(--blue)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Broadcast Tagihan</h2>
          </div>

          {/* Broadcast Settings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Delay per pesan (detik)</label>
              <input type="number" value={broadcastDelay} onChange={e => setBroadcastDelay(Number(e.target.value))} min={10} max={60} />
              <p className="text-[11px] text-[var(--text-quaternary)]">Min 10 detik, disarankan 15-30 detik untuk hindari ban</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Pesan</label>
              <div className="p-3 rounded-xl bg-[var(--bg-input)] text-[12px] text-[var(--text-tertiary)]">
                Rekap semua tagihan belum bayar per pelanggan (otomatis)
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="p-4 rounded-xl bg-[var(--bg-input)] space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold text-[var(--text-secondary)]">Preview Broadcast</span>
              <span className="badge badge-red text-[10px]">Semua belum bayar</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-2">
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)]">Pelanggan</p>
                <p className="text-[16px] font-bold text-[var(--text-primary)]">{customersWithUnpaid.length}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)]">Total Tagihan</p>
                <p className="text-[16px] font-bold text-[var(--red)]">{fmtRp(totalUnpaid)}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)]">Jumlah Invoice</p>
                <p className="text-[16px] font-bold text-[var(--text-primary)]">{unpaidInvoices.length}</p>
              </div>
              <div>
                <p className="text-[11px] text-[var(--text-tertiary)]">Estimasi</p>
                <p className="text-[16px] font-bold text-[var(--text-primary)]">{Math.ceil(customersWithUnpaid.length * broadcastDelay / 60)} mnt</p>
              </div>
            </div>
          </div>

          {/* Broadcast Progress */}
          {isBroadcasting && broadcast && (
            <div className="p-4 rounded-xl bg-[#25D366]/[0.05] border border-[#25D366]/20 space-y-3">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-[#25D366] animate-spin" />
                <span className="text-[13px] font-semibold text-[#25D366]">Broadcast berjalan...</span>
              </div>
              <div className="progress-track">
                <div
                  className="progress-fill bg-[#25D366]"
                  style={{ width: `${((broadcast.sent + broadcast.failed) / broadcast.total) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-4 text-[12px]">
                <span className="flex items-center gap-1 text-[var(--green)]"><CheckCircle2 className="w-3 h-3" /> {broadcast.sent} terkirim</span>
                <span className="flex items-center gap-1 text-[var(--red)]"><XCircle className="w-3 h-3" /> {broadcast.failed} gagal</span>
                <span className="text-[var(--text-tertiary)]">{broadcast.sent + broadcast.failed}/{broadcast.total}</span>
              </div>
              {broadcast.current && (
                <p className="text-[11px] text-[var(--text-quaternary)]">Mengirim ke: {broadcast.current}</p>
              )}
            </div>
          )}

          {/* Message */}
          {msg && (
            <div className="p-3 rounded-xl bg-[var(--blue-soft)] text-[13px] text-[var(--blue)] font-medium">{msg}</div>
          )}

          {/* Actions */}
          <div className="flex gap-2">
            {isBroadcasting ? (
              <button onClick={handleStop} className="btn btn-secondary text-[13px] text-[var(--red)] flex-1">
                <StopCircle className="w-4 h-4" /> Stop Broadcast
              </button>
            ) : (
              <button
                onClick={handleBroadcast}
                disabled={sending || customersWithUnpaid.length === 0}
                className="btn btn-primary text-[13px] flex-1 !py-3"
              >
                {sending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Memproses...</>
                ) : (
                  <><Send className="w-4 h-4" /> Broadcast ke {customersWithUnpaid.length} Pelanggan</>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Rekap Tagihan */}
      {connected && customersWithUnpaid.length > 0 && (
        <div className="card p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[var(--orange)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Rekap Tagihan Belum Bayar</h2>
            <span className="badge badge-red text-[10px]">Global</span>
          </div>

          {/* Detail Table */}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pelanggan</th>
                  <th>No. HP</th>
                  <th>Paket</th>
                  <th className="text-center">Tagihan</th>
                  <th className="text-right">Total Belum Bayar</th>
                </tr>
              </thead>
              <tbody>
                {customersWithUnpaid.map(c => {
                  const custInvoices = unpaidByCustomer.get(c.id) || [];
                  const total = custInvoices.reduce((s, i) => s + (i.totalAmount || i.amount), 0);
                  const pkg = packages.find(p => p.id === c.packageId);
                  return (
                    <tr key={c.id}>
                      <td className="font-medium text-[13px]">{c.name}</td>
                      <td className="text-[13px] text-[var(--text-tertiary)]">{c.phone}</td>
                      <td className="text-[12px] text-[var(--text-tertiary)]">{pkg?.name || "-"}</td>
                      <td className="text-center text-[13px]">
                        <span className="badge badge-red text-[10px]">{custInvoices.length} tagihan</span>
                      </td>
                      <td className="text-right font-bold text-[14px] text-[var(--red)] tabular-nums">{fmtRp(total)}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--border)]">
                  <td colSpan={4} className="font-bold text-[13px]">TOTAL ({customersWithUnpaid.length} pelanggan)</td>
                  <td className="text-right font-bold text-[16px] text-[var(--red)] tabular-nums">{fmtRp(totalUnpaid)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
