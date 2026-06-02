"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BillingAPI } from "@/lib/billing-api";
import { useBillingDevice } from "@/lib/use-billing-device";
import type { BillingInvoice, BillingCustomer, BillingPackage } from "@/lib/billing-types";
import { getEffectiveTotal, getEffectiveDiscount } from "@/lib/billing-types";
import {
  ArrowLeft, Calendar, CheckCircle2, AlertCircle,
  ChevronRight, TrendingUp, Wallet, Receipt, FileText, MessageCircle,
} from "lucide-react";
import { sendInvoiceWhatsApp } from "@/lib/invoice-text";

import BillingNav from "@/components/BillingNav";
const DeviceSelector = dynamic(() => import("@/components/DeviceSelector"), { ssr: false });
const PayModal = dynamic(() => import("@/components/PayModal"), { ssr: false });

const MONTHS = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];
const MONTHS_SHORT = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
const fmtRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

interface MonthData {
  month: number;
  name: string;
  short: string;
  invoices: BillingInvoice[];
  paidCount: number;
  unpaidCount: number;
  paidTotal: number;
  unpaidTotal: number;
  total: number;
}

export default function MonthlyPage() {
  const { device, setDevice } = useBillingDevice();
  const [invoices, setInvoices] = useState<BillingInvoice[]>([]);
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);
  const [payInvoice, setPayInvoice] = useState<BillingInvoice | null>(null);

  useEffect(() => {
    if (!device) return;
    setLoading(true);
    Promise.all([
      BillingAPI.getInvoices(device).catch(() => []),
      BillingAPI.getCustomers(device).catch(() => []),
      BillingAPI.getPackages(device).catch(() => []),
    ]).then(([i, c, p]) => { setInvoices(i); setCustomers(c); setPackages(p); setLoading(false); });
  }, [device]);

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || "-";
  const getCustomerQueue = (id: string) => customers.find(c => c.id === id)?.simpleQueue || "-";
  const getCustomerPackage = (id: string) => {
    const c = customers.find(c => c.id === id);
    return c ? packages.find(p => p.id === c.packageId)?.name || "-" : "-";
  };
  const getCustomerPackageSpeed = (id: string) => {
    const c = customers.find(c => c.id === id);
    if (!c) return undefined;
    const p = packages.find(p => p.id === c.packageId);
    return p ? { up: p.speedUp, down: p.speedDown } : undefined;
  };

  // Build month data
  const months: MonthData[] = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const monthInvoices = invoices.filter(inv => inv.month === i + 1 && inv.year === year);
      const paid = monthInvoices.filter(inv => inv.status === "paid");
      const unpaid = monthInvoices.filter(inv => inv.status === "unpaid");
      return {
        month: i + 1,
        name: MONTHS[i],
        short: MONTHS_SHORT[i],
        invoices: monthInvoices,
        paidCount: paid.length,
        unpaidCount: unpaid.length,
        paidTotal: paid.reduce((s, inv) => s + getEffectiveTotal(inv), 0),
        unpaidTotal: unpaid.reduce((s, inv) => s + getEffectiveTotal(inv), 0),
        total: monthInvoices.reduce((s, inv) => s + getEffectiveTotal(inv), 0),
      };
    });
  }, [invoices, year]);

  // Year totals
  const yearTotal = months.reduce((s, m) => s + m.invoices.reduce((s2, i) => s2 + getEffectiveTotal(i), 0), 0);
  const yearPaid = months.reduce((s, m) => s + m.invoices.filter(i => i.status === "paid").reduce((s2, i) => s2 + getEffectiveTotal(i), 0), 0);
  const yearUnpaid = months.reduce((s, m) => s + m.invoices.filter(i => i.status === "unpaid").reduce((s2, i) => s2 + getEffectiveTotal(i), 0), 0);
  const yearInvoices = months.reduce((s, m) => s + m.invoices.length, 0);

  // Available years
  const years = useMemo(() => {
    const set = new Set(invoices.map(i => i.year));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [invoices]);

  const openPay = (inv: BillingInvoice) => setPayInvoice(inv);
  const closePay = () => setPayInvoice(null);
  const onPaid = async () => {
    setPayInvoice(null);
    if (device) {
      const [i, c, p] = await Promise.all([
        BillingAPI.getInvoices(device),
        BillingAPI.getCustomers(device),
        BillingAPI.getPackages(device),
      ]);
      setInvoices(i); setCustomers(c); setPackages(p);
    }
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
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.025em]">Tagihan Per Bulan</h1>
            <p className="text-[13px] text-[var(--text-tertiary)]">Rincian tagihan Januari — Desember</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <DeviceSelector value={device} onChange={setDevice} />
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="!w-auto !py-2 !text-[13px] !rounded-xl">
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <BillingNav current="/billing/monthly" />

      {/* Year Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--blue)]" />
            <span className="text-[12px] font-medium text-[var(--text-tertiary)]">Total Tagihan</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[var(--text-primary)] tabular-nums">{fmtRp(yearTotal)}</p>
          <p className="text-[11px] text-[var(--text-quaternary)]">{yearInvoices} tagihan</p>
        </div>
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[var(--green)]" />
            <span className="text-[12px] font-medium text-[var(--text-tertiary)]">Terbayar</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[var(--green)] tabular-nums">{fmtRp(yearPaid)}</p>
        </div>
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-[var(--red)]" />
            <span className="text-[12px] font-medium text-[var(--text-tertiary)]">Belum Bayar</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[var(--red)] tabular-nums">{fmtRp(yearUnpaid)}</p>
        </div>
        <div className="card p-4 space-y-1">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-[var(--purple)]" />
            <span className="text-[12px] font-medium text-[var(--text-tertiary)]">Lunas</span>
          </div>
          <p className="text-[20px] sm:text-[24px] font-bold text-[var(--text-primary)] tabular-nums">
            {yearTotal > 0 ? Math.round((yearPaid / yearTotal) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Month Cards */}
      {loading ? (
        <div className="space-y-3">{[1,2,3,4].map(i => <div key={i} className="skeleton h-24 rounded-2xl" />)}</div>
      ) : (
        <div className="space-y-3">
          {months.map(m => {
            const isExpanded = expandedMonth === m.month;
            const hasInvoices = m.invoices.length > 0;
            const isCurrent = m.month === new Date().getMonth() + 1 && year === new Date().getFullYear();

            return (
              <div key={m.month} className={`card overflow-hidden transition-all ${isCurrent ? "ring-2 ring-[var(--blue)]/20" : ""}`}>
                {/* Month Header */}
                <button
                  onClick={() => setExpandedMonth(isExpanded ? null : m.month)}
                  className="w-full flex items-center gap-4 px-4 sm:px-5 py-3.5 hover:bg-[var(--bg-hover)] transition-colors text-left"
                >
                  {/* Month number badge */}
                  <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0
                    ${hasInvoices ? (m.unpaidCount > 0 ? "bg-[var(--orange-soft)]" : "bg-[var(--green-soft)]") : "bg-[var(--bg-input)]"}`}>
                    <span className={`text-[14px] font-bold tabular-nums
                      ${hasInvoices ? (m.unpaidCount > 0 ? "text-[var(--orange)]" : "text-[var(--green)]") : "text-[var(--text-quaternary)]"}`}>
                      {m.short}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[14px] font-semibold text-[var(--text-primary)]">{m.name} {year}</p>
                      {isCurrent && <span className="badge badge-blue text-[9px]">Bulan Ini</span>}
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      {hasInvoices ? (
                        <>
                          <span className="text-[12px] text-[var(--text-tertiary)]">{m.invoices.length} tagihan</span>
                          {m.paidCount > 0 && <span className="text-[11px] text-[var(--green)]">{m.paidCount} lunas</span>}
                          {m.unpaidCount > 0 && <span className="text-[11px] text-[var(--red)]">{m.unpaidCount} belum</span>}
                        </>
                      ) : (
                        <span className="text-[12px] text-[var(--text-quaternary)]">Belum ada tagihan</span>
                      )}
                    </div>
                  </div>

                  {/* Total */}
                  <div className="text-right flex-shrink-0">
                    {hasInvoices ? (
                      <>
                        <p className="text-[16px] sm:text-[18px] font-bold tabular-nums text-[var(--text-primary)]">{fmtRp(m.total)}</p>
                        {m.unpaidTotal > 0 && <p className="text-[11px] text-[var(--red)] tabular-nums">{fmtRp(m.unpaidTotal)} belum</p>}
                      </>
                    ) : (
                      <p className="text-[13px] text-[var(--text-quaternary)]">—</p>
                    )}
                  </div>

                  <ChevronRight className={`w-4 h-4 text-[var(--text-quaternary)] transition-transform duration-200 flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`} />
                </button>

                {/* Expanded: Invoice List */}
                {isExpanded && hasInvoices && (
                  <div className="border-t border-[var(--border-light)]">
                    <div className="overflow-x-auto">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>Pelanggan</th>
                            <th>Queue</th>
                            <th>Paket</th>
                            <th className="text-right">Jumlah</th>
                            <th>Status</th>
                            <th>Tanggal Bayar</th>
                            <th className="text-right">Aksi</th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.invoices.map(inv => (
                            <tr key={inv.id}>
                              <td className="font-medium text-[13px]">{getCustomerName(inv.customerId)}</td>
                              <td><code className="text-[11px] bg-[var(--bg-input)] px-1.5 py-0.5 rounded font-mono text-[var(--blue)]">{getCustomerQueue(inv.customerId)}</code></td>
                              <td className="text-[12px] text-[var(--text-tertiary)]">{getCustomerPackage(inv.customerId)}</td>
                              <td className="text-right font-semibold text-[13px] tabular-nums">
                                <div>{fmtRp(getEffectiveTotal(inv))}</div>
                                <div className="text-[10px] text-[var(--text-quaternary)] font-normal">
                                  {inv.ppn > 0 && <span>PPN {fmtRp(inv.ppn)}</span>}
                                  {getEffectiveDiscount(inv) > 0 && <span className="text-[var(--green)]"> · Diskon -{fmtRp(getEffectiveDiscount(inv))}</span>}
                                </div>
                              </td>
                              <td>
                                {inv.status === "paid" ? (
                                  <span className="badge badge-green text-[10px]">Lunas</span>
                                ) : (
                                  <span className="badge badge-red text-[10px]">Belum</span>
                                )}
                              </td>
                              <td className="text-[12px] text-[var(--text-tertiary)]">{inv.paidDate || "-"}</td>
                              <td className="text-right">
                                <div className="flex gap-1 justify-end">
                                  <button
                                    onClick={() => sendInvoiceWhatsApp({
                                      invoice: inv,
                                      customer: customers.find(c => c.id === inv.customerId)!,
                                      packageName: getCustomerPackage(inv.customerId),
                                      packageSpeed: getCustomerPackageSpeed(inv.customerId),
                                    })}
                                    className="btn !px-2.5 !py-1 !text-[11px] !rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20"
                                    title="Kirim via WhatsApp"
                                  >
                                    <MessageCircle className="w-3 h-3" /> WA
                                  </button>
                                  {inv.status === "unpaid" && (
                                    <button onClick={() => openPay(inv)} className="btn !px-2.5 !py-1 !text-[11px] !rounded-lg bg-[var(--green-soft)] text-[var(--green)] hover:bg-[var(--green)]/20">
                                      <CheckCircle2 className="w-3 h-3" /> Bayar
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Month subtotal */}
                    <div className="px-5 py-3 bg-[var(--bg-input)]/30 flex items-center justify-between text-[13px]">
                      <span className="font-semibold text-[var(--text-secondary)]">Total {m.name}</span>
                      <div className="flex items-center gap-4">
                        {m.paidTotal > 0 && <span className="text-[var(--green)] font-semibold tabular-nums">{fmtRp(m.paidTotal)} lunas</span>}
                        {m.unpaidTotal > 0 && <span className="text-[var(--red)] font-semibold tabular-nums">{fmtRp(m.unpaidTotal)} belum</span>}
                        <span className="font-bold text-[var(--text-primary)] tabular-nums">{fmtRp(m.total)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pay Modal */}
      {payInvoice && (
        <PayModal
          invoice={payInvoice}
          customerName={getCustomerName(payInvoice.customerId)}
          customer={customers.find(c => c.id === payInvoice.customerId)}
          packageName={getCustomerPackage(payInvoice.customerId)}
          packageSpeed={getCustomerPackageSpeed(payInvoice.customerId)}
          onClose={closePay}
          onPaid={onPaid}
        />
      )}
    </div>
  );
}
