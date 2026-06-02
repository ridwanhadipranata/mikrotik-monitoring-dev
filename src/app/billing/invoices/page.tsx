"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BillingAPI } from "@/lib/billing-api";
import { useBillingDevice } from "@/lib/use-billing-device";
import type { BillingInvoice, BillingCustomer, BillingPackage } from "@/lib/billing-types";
import { getEffectiveTotal } from "@/lib/billing-types";
import {
  FileText, ArrowLeft, X, Search, Wand2, ChevronRight,
  CheckCircle2,
} from "lucide-react";
import BillingNav from "@/components/BillingNav";
import type { ReceiptData } from "@/components/ReceiptModal";

const DeviceSelector = dynamic(() => import("@/components/DeviceSelector"), { ssr: false });
const CustomerDetailModal = dynamic(() => import("@/components/CustomerDetailModal"), { ssr: false });

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

function formatRp(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

function getMonthOptions() {
  const now = new Date();
  const opts: { label: string; month: number; year: number }[] = [];
  for (let i = -6; i <= 3; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    opts.push({ label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`, month: d.getMonth() + 1, year: d.getFullYear() });
  }
  return opts;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<BillingCustomer | null>(null);
  const { device, setDevice } = useBillingDevice();

  const now = new Date();
  const [filterMonth, setFilterMonth] = useState(now.getMonth() + 1);
  const [filterYear, setFilterYear] = useState(now.getFullYear());
  const monthOptions = getMonthOptions();

  const load = () => Promise.all([
    BillingAPI.getInvoices(device),
    BillingAPI.getCustomers(device),
    BillingAPI.getPackages(device),
  ]).then(([i, c, p]) => { setInvoices(i); setCustomers(c); setPackages(p); });

  useEffect(() => { if (!device) return; load().finally(() => setLoading(false)); }, [device]);

  // Filter invoices by selected month/year
  const monthInvoices = invoices.filter(i => i.month === filterMonth && i.year === filterYear);

  // Group by customer
  const customerMap = new Map<string, { customer: BillingCustomer; unpaidTotal: number; unpaidCount: number; paidCount: number }>();
  for (const inv of monthInvoices) {
    const cust = customers.find(c => c.id === inv.customerId);
    if (!cust) continue;
    const key = cust.id;
    if (!customerMap.has(key)) {
      customerMap.set(key, { customer: cust, unpaidTotal: 0, unpaidCount: 0, paidCount: 0 });
    }
    const entry = customerMap.get(key)!;
    if (inv.status === "unpaid") {
      entry.unpaidCount++;
      entry.unpaidTotal += getEffectiveTotal(inv);
    } else {
      entry.paidCount++;
    }
  }

  const grouped = Array.from(customerMap.values()).sort((a, b) => {
    if (a.unpaidCount !== b.unpaidCount) return b.unpaidCount - a.unpaidCount;
    return a.customer.name.localeCompare(b.customer.name);
  });

  const filtered = grouped.filter(g =>
    g.customer.name.toLowerCase().includes(search.toLowerCase()) ||
    g.customer.simpleQueue.toLowerCase().includes(search.toLowerCase()) ||
    (g.customer.phone || "").includes(search)
  );

  const totalUnpaid = grouped.reduce((s, g) => s + g.unpaidTotal, 0);
  const totalInvoices = monthInvoices.length;
  const unpaidCount = monthInvoices.filter(i => i.status === "unpaid").length;

  // Generate
  const [showGenerate, setShowGenerate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const handleGenerate = async () => {
    setSaving(true); setError("");
    try {
      const result = await BillingAPI.generateInvoices(filterMonth, filterYear, device);
      setShowGenerate(false);
      alert(`Berhasil generate ${result.created} tagihan dari ${result.total} pelanggan aktif`);
      load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  return (
    <div className="p-5 sm:p-8 space-y-6 max-w-[1200px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/billing" className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.025em]">Tagihan</h1>
            <p className="text-[14px] text-[var(--text-tertiary)]">{MONTHS[filterMonth - 1]} {filterYear}</p>
          </div>
          <DeviceSelector value={device} onChange={setDevice} />
        </div>
        <button onClick={() => { setError(""); setShowGenerate(true); }} className="btn btn-secondary text-[13px]">
          <Wand2 className="w-4 h-4" /> Generate
        </button>
      </div>

      <BillingNav current="/billing/invoices" />

      {/* Month Filter */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none -mx-1 px-1">
        {monthOptions.map(opt => {
          const active = opt.month === filterMonth && opt.year === filterYear;
          return (
            <button
              key={`${opt.month}-${opt.year}`}
              onClick={() => { setFilterMonth(opt.month); setFilterYear(opt.year); setSelectedCustomer(null); }}
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
      <div className="grid grid-cols-3 gap-3">
        <div className="card p-3.5 text-center">
          <p className="text-[22px] font-bold text-[var(--text-primary)]">{totalInvoices}</p>
          <p className="text-[12px] text-[var(--text-tertiary)] font-medium">Total Tagihan</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-[22px] font-bold text-[var(--red)]">{unpaidCount}</p>
          <p className="text-[12px] text-[var(--text-tertiary)] font-medium">Belum Bayar</p>
        </div>
        <div className="card p-3.5 text-center">
          <p className="text-[16px] font-bold text-[var(--red)] tabular-nums">{formatRp(totalUnpaid)}</p>
          <p className="text-[12px] text-[var(--text-tertiary)] font-medium">Total Piutang</p>
        </div>
      </div>

      {/* Search */}
      <div className="relative max-w-[360px]">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-quaternary)]" />
        <input type="text" placeholder="Cari pelanggan..." value={search} onChange={e => setSearch(e.target.value)} className="!pl-10 !py-2.5 !text-[14px] !rounded-xl" />
      </div>

      {/* Generate Modal */}
      {showGenerate && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowGenerate(false)}>
          <div className="card w-full max-w-[400px] p-6 !rounded-2xl shadow-[var(--shadow-xl)] anim-scale" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-bold text-[var(--text-primary)]">Generate Tagihan</h2>
              <button onClick={() => setShowGenerate(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]"><X className="w-4 h-4 text-[var(--text-tertiary)]" /></button>
            </div>
            <p className="text-[14px] text-[var(--text-tertiary)] mb-4">
              Generate tagihan untuk <strong>{MONTHS[filterMonth - 1]} {filterYear}</strong>. Tagihan yang sudah ada tidak diduplikat.
            </p>
            {error && <div className="mb-4 p-3 rounded-xl bg-[var(--red-soft)] text-[14px] text-[var(--red)] font-medium">{error}</div>}
            <div className="flex gap-2">
              <button onClick={() => setShowGenerate(false)} className="btn btn-secondary flex-1 text-[14px]">Batal</button>
              <button onClick={handleGenerate} disabled={saving} className="btn btn-primary flex-1 text-[14px]">
                {saving ? "Generating..." : <><Wand2 className="w-4 h-4" /> Generate</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Customer List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <FileText className="w-12 h-12 text-[var(--text-quaternary)] mx-auto mb-3" />
          <p className="text-[16px] font-semibold text-[var(--text-secondary)]">
            {search ? "Tidak ditemukan" : `Belum ada tagihan ${MONTHS[filterMonth - 1]} ${filterYear}`}
          </p>
          <p className="text-[14px] text-[var(--text-tertiary)] mt-1">
            {search ? "Coba kata kunci lain" : "Generate tagihan otomatis untuk membuat tagihan"}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(entry => {
            const c = entry.customer;
            const hasUnpaid = entry.unpaidCount > 0;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedCustomer(c)}
                className="w-full card flex items-center gap-3 px-4 py-3.5 hover:bg-[var(--bg-hover)] transition-colors text-left"
              >
                {/* Avatar */}
                <div className={`w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[16px] font-bold ${
                  c.status === "active" ? (hasUnpaid ? "bg-[var(--orange)]" : "bg-[var(--green)]") : "bg-[var(--red)]"
                }`}>
                  {c.name.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{c.name}</p>
                  <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">{c.simpleQueue}</p>
                </div>

                {/* Status */}
                <div className="text-right flex-shrink-0">
                  {hasUnpaid ? (
                    <>
                      <p className="text-[15px] font-bold text-[var(--red)] tabular-nums">{formatRp(entry.unpaidTotal)}</p>
                      <p className="text-[12px] text-[var(--text-tertiary)]">{entry.unpaidCount} belum bayar</p>
                    </>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[var(--green)]">
                      <CheckCircle2 className="w-4 h-4" />
                      <span className="text-[14px] font-semibold">Lunas</span>
                    </div>
                  )}
                </div>

                <ChevronRight className="w-5 h-5 text-[var(--text-quaternary)] flex-shrink-0" />
              </button>
            );
          })}
        </div>
      )}

      {/* Customer Detail Modal */}
      {selectedCustomer && (
        <CustomerDetailModal
          customer={selectedCustomer}
          invoices={invoices}
          packages={packages}
          onClose={() => setSelectedCustomer(null)}
          onUpdate={() => { load(); }}
        />
      )}
    </div>
  );
}
