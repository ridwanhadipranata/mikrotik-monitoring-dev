"use client";

import { useState, useEffect } from "react";
import { BillingAPI } from "@/lib/billing-api";
import type { BillingInvoice, BillingCustomer, BillingPackage } from "@/lib/billing-types";
import { getEffectiveDiscount, getEffectiveTotal } from "@/lib/billing-types";
import { sendInvoiceWhatsApp } from "@/lib/invoice-text";
import {
  X, CheckCircle2, AlertCircle, Clock, MessageCircle,
  Share2, Trash2, ChevronDown, ChevronUp, Phone, MapPin, Wifi,
} from "lucide-react";

import PayModal from "@/components/PayModal";
import ReceiptModal from "@/components/ReceiptModal";

const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];
function formatRp(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

interface Props {
  customer: BillingCustomer;
  invoices: BillingInvoice[];
  packages: BillingPackage[];
  onClose: () => void;
  onUpdate: () => void;
}

export default function CustomerDetailModal({ customer, invoices, packages, onClose, onUpdate }: Props) {
  const [payInvoice, setPayInvoice] = useState<BillingInvoice | null>(null);
  const [receipt, setReceipt] = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<{ type: string; invId: string } | null>(null);
  const [showAll, setShowAll] = useState(false);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const pkg = packages.find(p => p.id === customer.packageId);
  const customerInvoices = invoices
    .filter(i => i.customerId === customer.id)
    .sort((a, b) => b.year - a.year || b.month - a.month);

  const unpaid = customerInvoices.filter(i => i.status === "unpaid");
  const paid = customerInvoices.filter(i => i.status === "paid");
  const unpaidTotal = unpaid.reduce((s, i) => s + getEffectiveTotal(i), 0);
  const visibleInvoices = showAll ? customerInvoices : customerInvoices.slice(0, 12);

  const buildReceipt = (inv: BillingInvoice) => {
    const effDisc = getEffectiveDiscount(inv);
    const ppn = inv.ppn || Math.round(inv.amount * 0.11);
    return {
      customerName: customer.name,
      packageName: pkg?.name || "-",
      period: `${MONTHS[inv.month - 1]} ${inv.year}`,
      baseAmount: inv.amount, ppn, discount: effDisc,
      total: inv.amount + ppn - effDisc,
      paidDate: inv.paidDate || "-", invoiceId: inv.id,
    };
  };

  const handlePay = (inv: BillingInvoice) => {
    setPayInvoice(inv);
  };

  const handleWA = (inv: BillingInvoice) => {
    sendInvoiceWhatsApp({
      invoice: inv, customer,
      packageName: pkg?.name || "-",
      packageSpeed: pkg ? { up: pkg.speedUp, down: pkg.speedDown } : undefined,
    });
  };

  const handleUnpay = async (invId: string) => {
    try {
      await BillingAPI.updateInvoice(invId, { status: "unpaid", paidDate: null });
      setConfirmAction(null);
      onUpdate();
    } catch (e: any) { alert("Gagal: " + e.message); }
  };

  const handleDelete = async (invId: string) => {
    try {
      await BillingAPI.deleteInvoice(invId);
      setConfirmAction(null);
      onUpdate();
    } catch (e: any) { alert("Gagal: " + e.message); }
  };

  const handlePayAll = async () => {
    if (!confirm(`Bayar semua ${unpaid.length} tagihan ${customer.name}?`)) return;
    const paidDate = new Date().toISOString().slice(0, 10);
    const results = await Promise.allSettled(
      unpaid.map(inv => {
        const effDisc = getEffectiveDiscount(inv);
        return BillingAPI.updateInvoice(inv.id, { status: "paid", paidDate, discount: effDisc });
      })
    );
    const failed = results.filter(r => r.status === "rejected").length;
    if (failed > 0) {
      alert(`${unpaid.length - failed} berhasil, ${failed} gagal. Silakan coba lagi.`);
    }
    onUpdate();
  };

  const onPaid = () => { setPayInvoice(null); onUpdate(); };

  // ── If paying, show PayModal instead of detail ──
  if (payInvoice) {
    return (
      <PayModal
        invoice={payInvoice}
        customerName={customer.name}
        customer={customer}
        packageName={pkg?.name || "-"}
        packageSpeed={pkg ? { up: pkg.speedUp, down: pkg.speedDown } : undefined}
        onClose={() => setPayInvoice(null)}
        onPaid={onPaid}
      />
    );
  }

  if (receipt) {
    return <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />;
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-[540px] max-h-[90vh] !rounded-t-2xl sm:!rounded-2xl shadow-[var(--shadow-xl)] anim-scale overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-light)] bg-[var(--bg-input)]/30">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-full flex items-center justify-center text-white text-[16px] font-bold ${
              customer.status === "active" ? (unpaid.length > 0 ? "bg-[var(--orange)]" : "bg-[var(--green)]") : "bg-[var(--red)]"
            }`}>
              {customer.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-[17px] font-bold text-[var(--text-primary)]">{customer.name}</h2>
              <p className="text-[13px] text-[var(--text-secondary)]">{pkg?.name || "-"} · {customer.simpleQueue}</p>
            </div>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]">
            <X className="w-4 h-4 text-[var(--text-tertiary)]" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1">
          {/* Info */}
          <div className="px-5 py-4 space-y-2 border-b border-[var(--border-light)]">
            {customer.phone && <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]"><Phone className="w-3.5 h-3.5 text-[var(--text-quaternary)]" />{customer.phone}</div>}
            {customer.address && <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]"><MapPin className="w-3.5 h-3.5 text-[var(--text-quaternary)]" />{customer.address}</div>}
            {pkg && <div className="flex items-center gap-2 text-[13px] text-[var(--text-secondary)]"><Wifi className="w-3.5 h-3.5 text-[var(--text-quaternary)]" />↓{pkg.speedDown} ↑{pkg.speedUp} · {formatRp(pkg.price)}/bulan</div>}
            <div className="flex items-center gap-2 text-[13px]">
              <Clock className="w-3.5 h-3.5 text-[var(--text-quaternary)]" />
              <span className="text-[var(--text-secondary)]">Pasang: {customer.installDate}</span>
              <span className={`badge text-[11px] ml-auto ${customer.status === "active" ? "badge-green" : customer.status === "suspended" ? "badge-orange" : "badge-red"}`}>
                {customer.status === "active" ? "Aktif" : customer.status === "suspended" ? "Suspended" : "Putus"}
              </span>
            </div>
          </div>

          {/* Summary */}
          <div className="px-5 py-3 flex gap-4 border-b border-[var(--border-light)] bg-[var(--bg-input)]/20">
            <div className="flex-1 text-center"><p className="text-[18px] font-bold text-[var(--text-primary)]">{customerInvoices.length}</p><p className="text-[11px] text-[var(--text-tertiary)]">Total</p></div>
            <div className="w-px bg-[var(--border)]" />
            <div className="flex-1 text-center"><p className="text-[18px] font-bold text-[var(--red)]">{unpaid.length}</p><p className="text-[11px] text-[var(--text-tertiary)]">Belum</p></div>
            <div className="w-px bg-[var(--border)]" />
            <div className="flex-1 text-center"><p className="text-[18px] font-bold text-[var(--green)]">{paid.length}</p><p className="text-[11px] text-[var(--text-tertiary)]">Lunas</p></div>
          </div>

          {/* Invoice List */}
          <div className="px-5 py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Riwayat Tagihan</h3>
              {unpaid.length > 0 && (
                <button onClick={handlePayAll} className="btn !px-3 !py-1.5 !text-[12px] !rounded-lg bg-[var(--green-soft)] text-[var(--green)] hover:bg-[var(--green)]/20">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Bayar Semua ({unpaid.length})
                </button>
              )}
            </div>

            <div className="space-y-2">
              {visibleInvoices.map(inv => {
                const effTotal = getEffectiveTotal(inv);
                const effDisc = getEffectiveDiscount(inv);
                const isPaid = inv.status === "paid";
                const isConfirming = confirmAction?.invId === inv.id;

                return (
                  <div key={inv.id} className={`rounded-xl border ${isPaid ? "border-[var(--green)]/20 bg-[var(--green-soft)]/30" : "border-[var(--red)]/20 bg-[var(--red-soft)]/30"}`}>
                    {/* Invoice info row */}
                    <div className="flex items-center gap-3 px-3.5 py-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${isPaid ? "bg-[var(--green-soft)]" : "bg-[var(--red-soft)]"}`}>
                        {isPaid ? <CheckCircle2 className="w-4 h-4 text-[var(--green)]" /> : <AlertCircle className="w-4 h-4 text-[var(--red)]" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-semibold text-[var(--text-primary)]">{MONTHS[inv.month - 1]} {inv.year}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {isPaid && inv.paidDate && <span className="text-[11px] text-[var(--text-tertiary)]">Bayar: {inv.paidDate}</span>}
                          {inv.ppn > 0 && <span className="text-[11px] text-[var(--text-quaternary)]">PPN {formatRp(inv.ppn)}</span>}
                          {effDisc > 0 && <span className="text-[11px] text-[var(--green)]">Diskon -{formatRp(effDisc)}</span>}
                        </div>
                      </div>
                      <p className={`text-[15px] font-bold tabular-nums ${isPaid ? "text-[var(--green)]" : "text-[var(--red)]"}`}>{formatRp(effTotal)}</p>
                    </div>

                    {/* Buttons */}
                    <div className="flex gap-1.5 px-3.5 pb-3">
                      <button onClick={() => handleWA(inv)} className="flex-1 btn !py-2 !text-[12px] !rounded-lg bg-[#25D366]/10 text-[#25D366] hover:bg-[#25D366]/20">
                        <MessageCircle className="w-3.5 h-3.5" /> WA
                      </button>
                      {!isPaid ? (
                        <button onClick={() => handlePay(inv)} className="flex-1 btn !py-2 !text-[12px] !rounded-lg bg-[var(--green-soft)] text-[var(--green)] hover:bg-[var(--green)]/20">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Bayar
                        </button>
                      ) : (
                        <button onClick={() => setReceipt(buildReceipt(inv))} className="flex-1 btn !py-2 !text-[12px] !rounded-lg bg-[var(--blue-soft)] text-[var(--blue)] hover:bg-[var(--blue)]/20">
                          <Share2 className="w-3.5 h-3.5" /> Bukti
                        </button>
                      )}
                      {isPaid ? (
                        <button onClick={() => setConfirmAction(isConfirming ? null : { type: "unpay", invId: inv.id })} className="btn !px-2.5 !py-2 !text-[12px] !rounded-lg bg-[var(--orange-soft)] text-[var(--orange)] hover:bg-[var(--orange)]/20">
                          <Clock className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button onClick={() => setConfirmAction(isConfirming ? null : { type: "delete", invId: inv.id })} className="btn !px-2.5 !py-2 !text-[12px] !rounded-lg bg-[var(--red-soft)] text-[var(--red)] hover:bg-[var(--red)]/20">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Confirm */}
                    {isConfirming && (
                      <div className="px-3.5 pb-3">
                        <div className="p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border)]">
                          <p className="text-[13px] text-[var(--text-primary)] font-medium mb-2">
                            {confirmAction.type === "unpay" ? `Batalkan pembayaran?` : `Hapus tagihan?`}
                          </p>
                          <div className="flex gap-2">
                            <button onClick={() => setConfirmAction(null)} className="btn btn-secondary flex-1 !text-[12px] !py-2">Batal</button>
                            <button
                              onClick={() => confirmAction.type === "unpay" ? handleUnpay(confirmAction.invId) : handleDelete(confirmAction.invId)}
                              className={`btn flex-1 !text-[12px] !py-2 ${confirmAction.type === "unpay" ? "bg-[var(--orange)] text-white" : "bg-[var(--red)] text-white"}`}
                            >
                              {confirmAction.type === "unpay" ? "Ya, Batalkan" : "Ya, Hapus"}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {customerInvoices.length > 12 && (
              <button onClick={() => setShowAll(!showAll)} className="w-full mt-3 py-2.5 rounded-xl text-[13px] font-semibold text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] flex items-center justify-center gap-1">
                {showAll ? <><ChevronUp className="w-4 h-4" /> Sedikit</> : <><ChevronDown className="w-4 h-4" /> Semua ({customerInvoices.length})</>}
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[var(--border-light)] bg-[var(--bg-input)]/20">
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-[var(--text-tertiary)]">Total belum bayar</span>
            <span className="text-[17px] font-bold text-[var(--red)] tabular-nums">{formatRp(unpaidTotal)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
