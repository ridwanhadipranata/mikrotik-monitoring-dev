"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BillingAPI } from "@/lib/billing-api";
import { useBillingDevice } from "@/lib/use-billing-device";
import type { BillingInvoice, BillingCustomer, BillingPackage } from "@/lib/billing-types";
import { getEffectiveDiscount, getEffectiveTotal } from "@/lib/billing-types";
import {
  Clock, ArrowLeft, Search, CheckCircle2, Share2,
} from "lucide-react";
import BillingNav from "@/components/BillingNav";
import ReceiptModal from "@/components/ReceiptModal";
import type { ReceiptData } from "@/components/ReceiptModal";

const DeviceSelector = dynamic(() => import("@/components/DeviceSelector"), { ssr: false });

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatRp(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function getMonthOptions() {
  const now = new Date();
  const opts: { label: string; month: number; year: number }[] = [{ label: "Semua", month: 0, year: 0 }];
  for (let i = -6; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    opts.push({ label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, month: d.getMonth() + 1, year: d.getFullYear() });
  }
  return opts;
}

export default function HistoryPage() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMonth, setFilterMonth] = useState(0); // 0 = all
  const [filterYear, setFilterYear] = useState(0);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const { device, setDevice } = useBillingDevice();
  const monthOptions = getMonthOptions();

  const load = () => Promise.all([
    BillingAPI.getInvoices(device),
    BillingAPI.getCustomers(device),
    BillingAPI.getPackages(device),
  ]).then(([i, c, p]) => { setInvoices(i); setCustomers(c); setPackages(p); });

  useEffect(() => { if (!device) return; load().finally(() => setLoading(false)); }, [device]);

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || "-";
  const getPackageName = (id: string) => packages.find(p => p.id === id)?.name || "-";

  // Only paid invoices
  const paidInvoices = invoices.filter(i => i.status === "paid");

  // Filter
  const filtered = paidInvoices
    .filter(i => {
      if (filterMonth > 0 && (i.month !== filterMonth || i.year !== filterYear)) return false;
      if (search) {
        const name = getCustomerName(i.customerId).toLowerCase();
        if (!name.includes(search.toLowerCase())) return false;
      }
      return true;
    })
    .sort((a, b) => {
      // Sort by paid date desc
      const da = a.paidDate || "";
      const db = b.paidDate || "";
      if (db !== da) return db.localeCompare(da);
      return b.year - a.year || b.month - a.month;
    });

  const totalPaid = filtered.reduce((s, i) => s + getEffectiveTotal(i), 0);

  const buildReceipt = (inv: BillingInvoice): ReceiptData => {
    const effDisc = getEffectiveDiscount(inv);
    const ppn = Math.round(inv.amount * 0.11);
    return {
      customerName: getCustomerName(inv.customerId),
      packageName: getPackageName(customers.find(c => c.id === inv.customerId)?.packageId || ""),
      period: `${MONTHS[inv.month - 1]} ${inv.year}`,
      baseAmount: inv.amount,
      ppn,
      discount: effDisc,
      total: inv.amount + ppn - effDisc,
      paidDate: inv.paidDate || "-",
      invoiceId: inv.id,
    };
  };

  // Group by date
  const groupedByDate = new Map<string, typeof filtered>();
  for (const inv of filtered) {
    const dateKey = inv.paidDate || "Unknown";
    if (!groupedByDate.has(dateKey)) groupedByDate.set(dateKey, []);
    groupedByDate.get(dateKey)!.push(inv);
  }

  return (
    <div className="p-5 sm:p-8 space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/billing" className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.025em]">Riwayat Pembayaran</h1>
            <p className="text-[14px] text-[var(--text-tertiary)]">{paidInvoices.length} pembayaran tercatat</p>
          </div>
          <DeviceSelector value={device} onChange={setDevice} />
        </div>
      </div>

      <BillingNav current="/billing/history" />

      {/* Month Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        {monthOptions.map(opt => {
          const active = opt.month === filterMonth && opt.year === filterYear;
          const isAll = opt.month === 0;
          return (
            <button
              key={`${opt.month}-${opt.year}`}
              onClick={() => { setFilterMonth(isAll ? 0 : opt.month); setFilterYear(isAll ? 0 : opt.year); }}
              className={`px-4 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all ${
                active
                  ? "bg-[var(--blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
                  : "bg-[var(--bg-card)] text-[var(--text-tertiary)] border border-[var(--border)] hover:border-[var(--blue)]/30"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {/* Summary */}
      <div className="flex items-center gap-4">
        <div className="card p-4 flex-1 text-center">
          <p className="text-[22px] font-bold text-[var(--green)] tabular-nums">{formatRp(totalPaid)}</p>
          <p className="text-[12px] text-[var(--text-tertiary)] font-medium">Total Terbayar</p>
        </div>
        <div className="card p-4 flex-1 text-center">
          <p className="text-[22px] font-bold text-[var(--text-primary)]">{filtered.length}</p>
          <p className="text-[12px] text-[var(--text-tertiary)] font-medium">Transaksi</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-[360px]">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-quaternary)]" />
        <input type="text" placeholder="Cari pelanggan..." value={search} onChange={e => setSearch(e.target.value)} className="!pl-10 !py-2.5 !text-[14px] !rounded-xl" />
      </div>

      {/* Payment List — Grouped by Date */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <Clock className="w-12 h-12 text-[var(--text-quaternary)] mx-auto mb-3" />
          <p className="text-[16px] font-semibold text-[var(--text-secondary)]">
            {search ? "Tidak ditemukan" : "Belum ada riwayat pembayaran"}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedByDate.entries()).map(([dateKey, invs]) => (
            <div key={dateKey}>
              {/* Date Header */}
              <div className="flex items-center gap-3 mb-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--green-soft)] flex items-center justify-center">
                  <CheckCircle2 className="w-4 h-4 text-[var(--green)]" />
                </div>
                <h3 className="text-[14px] font-bold text-[var(--text-primary)]">{dateKey}</h3>
                <span className="text-[12px] text-[var(--text-tertiary)]">{invs.length} pembayaran</span>
                <div className="flex-1 h-px bg-[var(--border-light)]" />
              </div>

              {/* Cards */}
              <div className="space-y-2">
                {invs.map(inv => {
                  const effTotal = getEffectiveTotal(inv);
                  const effDisc = getEffectiveDiscount(inv);
                  const custName = getCustomerName(inv.customerId);
                  const custPkg = getPackageName(customers.find(c => c.id === inv.customerId)?.packageId || "");
                  return (
                    <div key={inv.id} className="card p-4">
                      <div className="flex items-center gap-3">
                        {/* Avatar */}
                        <div className="w-10 h-10 rounded-full bg-[var(--green)] flex items-center justify-center flex-shrink-0 text-white text-[14px] font-bold">
                          {custName.charAt(0).toUpperCase()}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{custName}</p>
                          <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">{custPkg} · {MONTHS[inv.month - 1]} {inv.year}</p>
                          {effDisc > 0 && (
                            <p className="text-[11px] text-[var(--green)] font-medium mt-0.5">Diskon -{formatRp(effDisc)}</p>
                          )}
                        </div>

                        {/* Amount */}
                        <div className="text-right flex-shrink-0">
                          <p className="text-[16px] font-bold text-[var(--green)] tabular-nums">{formatRp(effTotal)}</p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border-light)]">
                        <button
                          onClick={() => setReceipt(buildReceipt(inv))}
                          className="btn !px-3 !py-1.5 !text-[12px] !rounded-lg bg-[var(--blue-soft)] text-[var(--blue)] hover:bg-[var(--blue)]/20"
                        >
                          <Share2 className="w-3.5 h-3.5" /> Bukti Pembayaran
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Receipt Modal */}
      {receipt && (
        <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />
      )}
    </div>
  );
}
