"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BillingAPI } from "@/lib/billing-api";
import { useBillingDevice } from "@/lib/use-billing-device";
import type { BillingSummary, BillingCustomer, BillingInvoice, BillingPackage } from "@/lib/billing-types";
import { getEffectiveTotal } from "@/lib/billing-types";
import {
  CreditCard, Users, Package, TrendingUp, AlertCircle,
  CheckCircle2, ArrowRight, Wallet, Receipt, ChevronRight,
  Search, X, Calendar, MessageCircle,
} from "lucide-react";
import { getEffectiveDiscount } from "@/lib/billing-types";
import { sendInvoiceWhatsApp } from "@/lib/invoice-text";
import type { ReceiptData } from "@/components/ReceiptModal";

const DeviceSelector = dynamic(() => import("@/components/DeviceSelector"), { ssr: false });
const PayModal = dynamic(() => import("@/components/PayModal"), { ssr: false });
const ReceiptModal = dynamic(() => import("@/components/ReceiptModal"), { ssr: false });
const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const fmtRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export default function BillingDashboard() {
  const { device, setDevice } = useBillingDevice();
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!device) return;
    setLoading(true);
    Promise.all([
      BillingAPI.getSummary(device).catch(() => null),
      BillingAPI.getCustomers(device).catch(() => []),
      BillingAPI.getPackages(device).catch(() => []),
      BillingAPI.getInvoices(device).catch(() => []),
    ]).then(([s, c, p, i]) => { setSummary(s); setCustomers(c); setPackages(p); setInvoices(i); setLoading(false); });
  }, [device]);

  const getPackageName = (id: string) => packages.find(p => p.id === id)?.name || "-";
  const getPackagePrice = (id: string) => packages.find(p => p.id === id)?.price || 0;

  const now = new Date();
  const currentMonth = now.getMonth() + 1;
  const currentYear = now.getFullYear();

  const customerStatus = useMemo(() => customers.map(c => {
    const pkg = packages.find(p => p.id === c.packageId);
    const customerInvoices = invoices.filter(i => i.customerId === c.id);
    const unpaid = customerInvoices.filter(i => i.status === "unpaid");
    const unpaidTotal = unpaid.reduce((s, i) => s + getEffectiveTotal(i), 0);
    const currentInvoice = customerInvoices.find(i => i.month === currentMonth && i.year === currentYear);
    return { ...c, packageName: pkg?.name || "-", packagePrice: pkg?.price || 0, unpaidCount: unpaid.length, unpaidTotal, isCurrentUnpaid: currentInvoice?.status === "unpaid", currentInvoice };
  }), [customers, packages, invoices, currentMonth, currentYear]);

  const filtered = search
    ? customerStatus.filter(c => c.name.toLowerCase().includes(search.toLowerCase()) || c.simpleQueue.toLowerCase().includes(search.toLowerCase()) || (c.phone || "").includes(search) || (c.address || "").toLowerCase().includes(search.toLowerCase()))
    : customerStatus;

  const sorted = [...filtered].sort((a, b) => { if (a.unpaidCount !== b.unpaidCount) return b.unpaidCount - a.unpaidCount; return a.name.localeCompare(b.name); });
  const activeWithUnpaid = customerStatus.filter(c => c.status === "active" && c.unpaidCount > 0);

  const [selectedCustomer, setSelectedCustomer] = useState<typeof customerStatus[0] | null>(null);
  const customerInvoices = selectedCustomer ? invoices.filter(i => i.customerId === selectedCustomer.id).sort((a, b) => b.year - a.year || b.month - a.month) : [];
  const [payInvoice, setPayInvoice] = useState<BillingInvoice | null>(null);
  const [batchReceipt, setBatchReceipt] = useState<ReceiptData | null>(null);
  const closePay = () => setPayInvoice(null);
  const onPaid = () => { setPayInvoice(null); setSelectedCustomer(null); load(); };
  const load = () => Promise.all([BillingAPI.getSummary(device).catch(() => null), BillingAPI.getCustomers(device).catch(() => []), BillingAPI.getPackages(device).catch(() => []), BillingAPI.getInvoices(device).catch(() => [])]).then(([s, c, p, i]) => { setSummary(s); setCustomers(c); setPackages(p); setInvoices(i); });

  if (!device) {
    return (
      <div className="min-h-screen bg-[var(--bg-base)]">
        <div className="w-full px-6 py-8 space-y-6">
          <div><h1 className="text-[26px] font-bold text-[var(--text-primary)]">Billing</h1><p className="text-[15px] text-[var(--text-tertiary)] mt-1">Pilih router untuk mulai</p></div>
          <DeviceSelector value={device} onChange={setDevice} />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <div className="w-full px-4 sm:px-6 lg:px-10 py-6 sm:py-8 space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-[24px] sm:text-[28px] font-bold text-[var(--text-primary)] tracking-[-0.025em]">Billing</h1>
            <p className="text-[14px] sm:text-[15px] text-[var(--text-tertiary)] mt-0.5">Kelola tagihan pelanggan internet</p>
          </div>
          <div className="flex items-center gap-3">
            <DeviceSelector value={device} onChange={setDevice} />
            <Link href="/billing/invoices" className="btn btn-primary text-[13px]">
              <CreditCard className="w-4 h-4" /> <span className="hidden sm:inline">Kelola Tagihan</span><span className="sm:hidden">Tagihan</span>
            </Link>
          </div>
        </div>

        {/* ── Stat Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-5">
          <div className="card p-4 lg:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-[12px] bg-[var(--blue-soft)] flex items-center justify-center"><Users className="w-5 h-5 text-[var(--blue)]" /></div>
              <span className="badge badge-green text-[11px]">{summary?.activeCustomers || 0} aktif</span>
            </div>
            <p className="text-[26px] lg:text-[32px] font-bold text-[var(--text-primary)] tabular-nums">{summary?.totalCustomers || 0}</p>
            <p className="text-[13px] text-[var(--text-tertiary)] font-medium mt-1">Pelanggan</p>
          </div>
          <div className="card p-4 lg:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-[12px] bg-[var(--purple-soft)] flex items-center justify-center"><Package className="w-5 h-5 text-[var(--purple)]" /></div>
            </div>
            <p className="text-[26px] lg:text-[32px] font-bold text-[var(--text-primary)] tabular-nums">{summary?.totalPackages || 0}</p>
            <p className="text-[13px] text-[var(--text-tertiary)] font-medium mt-1">Paket</p>
          </div>
          <div className="card p-4 lg:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-[12px] bg-[var(--green-soft)] flex items-center justify-center"><Wallet className="w-5 h-5 text-[var(--green)]" /></div>
            </div>
            <p className="text-[20px] lg:text-[26px] font-bold text-[var(--green)] tabular-nums">{fmtRp(summary?.totalPaid || 0)}</p>
            <p className="text-[13px] text-[var(--text-tertiary)] font-medium mt-1">Terbayar</p>
          </div>
          <div className="card p-4 lg:p-6">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-[12px] bg-[var(--red-soft)] flex items-center justify-center"><AlertCircle className="w-5 h-5 text-[var(--red)]" /></div>
            </div>
            <p className="text-[20px] lg:text-[26px] font-bold text-[var(--red)] tabular-nums">{fmtRp(summary?.totalUnpaid || 0)}</p>
            <p className="text-[13px] text-[var(--text-tertiary)] font-medium mt-1">Piutang</p>
          </div>
        </div>

        {/* ── Customer List ── */}
        <div className="card overflow-hidden">
          {/* List Header */}
          <div className="px-4 lg:px-8 py-4 border-b border-[var(--border-light)] flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <Users className="w-[18px] h-[18px] text-[var(--blue)]" />
              <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">Pelanggan</h3>
              {activeWithUnpaid.length > 0 && (
                <span className="badge badge-red text-[10px]">{activeWithUnpaid.length} belum bayar</span>
              )}
            </div>
            <div className="relative w-[200px] sm:w-[280px]">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-quaternary)]" />
              <input type="text" placeholder="Cari pelanggan..." value={search} onChange={e => setSearch(e.target.value)} className="!pl-10 !pr-4 !py-2.5 !text-[13px] !rounded-xl w-full" />
            </div>
          </div>

          {/* Customer Rows */}
          {loading ? (
            <div className="p-4 lg:p-6 space-y-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-[60px] rounded-xl" />)}</div>
          ) : sorted.length === 0 ? (
            <div className="p-12 text-center">
              <Users className="w-12 h-12 text-[var(--text-quaternary)] mx-auto mb-3 opacity-30" />
              <p className="text-[15px] font-semibold text-[var(--text-secondary)]">{search ? "Tidak ditemukan" : "Belum ada pelanggan"}</p>
              <p className="text-[13px] text-[var(--text-tertiary)] mt-1">{search ? "Coba kata kunci lain" : "Daftarkan pelanggan pertama Anda"}</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--border-light)]">
              {sorted.map(c => (
                <div key={c.id}
                  className="flex items-center gap-3 lg:gap-5 px-4 lg:px-8 py-4 lg:py-5 hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                  onClick={() => setSelectedCustomer(c)}
                >
                  {/* Avatar */}
                  <div className={`w-11 h-11 lg:w-13 lg:h-13 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[17px] lg:text-[18px] font-bold ${c.status === "active" ? (c.unpaidCount > 0 ? "bg-[var(--orange)]" : "bg-[var(--green)]") : c.status === "suspended" ? "bg-[var(--orange)]" : "bg-[var(--red)]"}`}>
                    {c.name.charAt(0).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] lg:text-[17px] font-semibold text-[var(--text-primary)] truncate">{c.name}</span>
                      {c.status !== "active" && (
                        <span className={`badge text-[10px] ${c.status === "suspended" ? "badge-orange" : "badge-red"}`}>
                          {c.status === "suspended" ? "Suspended" : "Putus"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[13px] lg:text-[14px] text-[var(--text-secondary)] font-medium">{c.packageName}</span>
                      {c.phone && <span className="text-[12px] lg:text-[13px] text-[var(--text-tertiary)]">· {c.phone}</span>}
                    </div>
                    {c.address && <p className="text-[12px] text-[var(--text-quaternary)] truncate mt-1">📍 {c.address}</p>}
                  </div>

                  {/* Status */}
                  <div className="text-right flex-shrink-0">
                    {c.unpaidCount > 0 ? (
                      <>
                        <p className="text-[15px] lg:text-[16px] font-bold text-[var(--red)] tabular-nums">{fmtRp(c.unpaidTotal)}</p>
                        <p className="text-[11px] lg:text-[12px] text-[var(--text-tertiary)] font-medium">{c.unpaidCount} belum bayar</p>
                      </>
                    ) : (
                      <div className="flex items-center gap-1.5 text-[var(--green)]">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-[14px] font-semibold">Lunas</span>
                      </div>
                    )}
                  </div>

                  <ChevronRight className="w-4 h-4 text-[var(--text-quaternary)] flex-shrink-0 hidden sm:block" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Customer Detail Modal ── */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-[100] flex items-end lg:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setSelectedCustomer(null)}>
          <div className="card w-full max-w-[500px] lg:max-w-[560px] max-h-[85vh] !rounded-t-2xl lg:!rounded-2xl shadow-[var(--shadow-xl)] anim-scale overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 lg:px-6 py-4 border-b border-[var(--border-light)] bg-[var(--bg-input)]/30">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-bold ${selectedCustomer.status === "active" ? "bg-[var(--blue)]" : "bg-[var(--orange)]"}`}>
                  {selectedCustomer.name.charAt(0).toUpperCase()}
                </div>
                <div>
                  <h3 className="text-[16px] font-bold text-[var(--text-primary)]">{selectedCustomer.name}</h3>
                  <p className="text-[12px] text-[var(--text-tertiary)]">{selectedCustomer.packageName} · {selectedCustomer.simpleQueue}</p>
                </div>
              </div>
              <button onClick={() => setSelectedCustomer(null)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]">
                <X className="w-4 h-4 text-[var(--text-tertiary)]" />
              </button>
            </div>

            {/* Invoices */}
            <div className="flex-1 overflow-y-auto">
              {customerInvoices.length === 0 ? (
                <div className="p-10 text-center">
                  <Receipt className="w-10 h-10 text-[var(--text-quaternary)] mx-auto mb-3 opacity-30" />
                  <p className="text-[14px] text-[var(--text-tertiary)]">Belum ada tagihan</p>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border-light)]">
                  {customerInvoices.map(inv => {
                    const effTotal = getEffectiveTotal(inv);
                    const effDisc = getEffectiveDiscount(inv);
                    return (
                      <div key={inv.id} className="px-5 lg:px-6 py-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2.5">
                            <Calendar className="w-4 h-4 text-[var(--text-tertiary)]" />
                            <span className="text-[14px] font-semibold text-[var(--text-primary)]">{MONTHS[inv.month - 1]} {inv.year}</span>
                          </div>
                          <span className={`badge text-[11px] ${inv.status === "paid" ? "badge-green" : "badge-red"}`}>
                            {inv.status === "paid" ? "Lunas" : "Belum Bayar"}
                          </span>
                        </div>
                        <div className="flex items-center justify-between mt-2.5">
                          <div className="text-[13px] text-[var(--text-tertiary)]">
                            <span>PPN {fmtRp(inv.ppn)}</span>
                            {effDisc > 0 && <span className="text-[var(--green)] font-medium"> · Diskon -{fmtRp(effDisc)}</span>}
                          </div>
                          <span className="text-[15px] font-bold text-[var(--text-primary)] tabular-nums">{fmtRp(effTotal)}</span>
                        </div>
                        {inv.status === "unpaid" && (
                          <div className="flex gap-2 mt-3">
                            <button onClick={() => { const pkg = packages.find(p => p.id === selectedCustomer.packageId); sendInvoiceWhatsApp({ invoice: inv, customer: customers.find(c => c.id === inv.customerId)!, packageName: selectedCustomer.packageName, packageSpeed: pkg ? { up: pkg.speedUp, down: pkg.speedDown } : undefined }); }} className="btn !px-3 !py-1.5 !text-[12px] !rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20"><MessageCircle className="w-3.5 h-3.5" /> WA</button>
                            <button onClick={() => setPayInvoice(inv)} className="btn !px-3 !py-1.5 !text-[12px] !rounded-lg bg-[var(--green-soft)] text-[var(--green)] hover:bg-[var(--green)]/20"><CheckCircle2 className="w-3.5 h-3.5" /> Bayar</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            {customerInvoices.length > 0 && (
              <div className="px-5 lg:px-6 py-4 border-t border-[var(--border-light)] bg-[var(--bg-input)]/30 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--text-tertiary)]">Total belum bayar</span>
                  <span className="text-[16px] font-bold text-[var(--red)] tabular-nums">{fmtRp(customerInvoices.filter(i => i.status === "unpaid").reduce((s, i) => s + getEffectiveTotal(i), 0))}</span>
                </div>
                {customerInvoices.some(i => i.status === "unpaid") && (
                  <button onClick={async () => { const unpaidInvoices = customerInvoices.filter(i => i.status === "unpaid"); if (!confirm(`Bayar semua ${unpaidInvoices.length} tagihan ${selectedCustomer.name}?`)) return; try { let totalPaid = 0, totalDiscount = 0, totalPPN = 0, totalBase = 0; const paidDate = new Date().toISOString().slice(0, 10); for (const inv of unpaidInvoices) { const effDisc = getEffectiveDiscount(inv); totalBase += inv.amount; totalPPN += inv.ppn; totalDiscount += effDisc; totalPaid += inv.amount + inv.ppn - effDisc; await BillingAPI.updateInvoice(inv.id, { status: "paid", paidDate, discount: effDisc }); } const periodRange = unpaidInvoices.length === 1 ? `${MONTHS[unpaidInvoices[0].month - 1]} ${unpaidInvoices[0].year}` : `${MONTHS[unpaidInvoices[0].month - 1]} ${unpaidInvoices[0].year} - ${MONTHS[unpaidInvoices[unpaidInvoices.length-1].month - 1]} ${unpaidInvoices[unpaidInvoices.length-1].year}`; setBatchReceipt({ customerName: selectedCustomer.name, packageName: selectedCustomer.packageName, period: `${periodRange} (${unpaidInvoices.length} tagihan)`, baseAmount: totalBase, ppn: totalPPN, discount: totalDiscount, total: totalPaid, paidDate, invoiceId: unpaidInvoices.map(i => i.id).join(", ") }); setSelectedCustomer(null); load(); } catch (e: any) { alert("Gagal: " + e.message); } }} className="btn w-full !py-3.5 !text-[14px] !font-semibold bg-[var(--green)] text-white hover:bg-[#2db84d] shadow-[0_2px_8px_rgba(52,199,89,0.3)]"><CheckCircle2 className="w-4 h-4" /> Bayar Semua</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {payInvoice && <PayModal invoice={payInvoice} customerName={customers.find(c => c.id === payInvoice.customerId)?.name || "-"} customer={customers.find(c => c.id === payInvoice.customerId)} packageName={packages.find(p => p.id === customers.find(c => c.id === payInvoice.customerId)?.packageId)?.name || "-"} packageSpeed={(() => { const pkg = packages.find(p => p.id === customers.find(c => c.id === payInvoice.customerId)?.packageId); return pkg ? { up: pkg.speedUp, down: pkg.speedDown } : undefined; })()} onClose={closePay} onPaid={onPaid} />}

      {/* Batch Receipt Modal */}
      {batchReceipt && <ReceiptModal receipt={batchReceipt} onClose={() => setBatchReceipt(null)} />}
    </div>
  );
}
