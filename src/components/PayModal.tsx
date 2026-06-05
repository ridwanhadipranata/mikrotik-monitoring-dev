"use client";

import { useState, useEffect } from "react";
import { BillingAPI } from "@/lib/billing-api";
import type { BillingInvoice, BillingCustomer } from "@/lib/billing-types";
import { getEffectiveDiscount } from "@/lib/billing-types";
import { X, CheckCircle2, Receipt, Tag, Calculator, MessageCircle } from "lucide-react";
import { sendInvoiceWhatsApp } from "@/lib/invoice-text";
import ReceiptModal from "@/components/ReceiptModal";
import type { ReceiptData } from "@/components/ReceiptModal";

const fmtRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
const MONTHS = ["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"];

interface PayModalProps {
  invoice: BillingInvoice;
  customerName: string;
  customer?: BillingCustomer;
  packageName: string;
  packageSpeed?: { up: string; down: string };
  onClose: () => void;
  onPaid: () => void;
}

export default function PayModal({ invoice, customerName, customer, packageName, packageSpeed, onClose, onPaid }: PayModalProps) {
  // Memoize initial discount state to avoid recomputation on every render
  const [initialState] = useState(() => {
    const today = new Date().getDate();
    const effectiveFromHelper = getEffectiveDiscount(invoice);
    const defaultDiscount = invoice.discount > 0 ? invoice.discount : effectiveFromHelper;
    return {
      discount: defaultDiscount,
      discountInput: String(defaultDiscount),
      discountRemoved: invoice.discount === 0 && today > 10,
    };
  });

  const [discount, setDiscount] = useState(initialState.discount);
  const [discountInput, setDiscountInput] = useState(initialState.discountInput);
  const [discountRemoved, setDiscountRemoved] = useState(initialState.discountRemoved);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  // Handle Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  const baseAmount = invoice.amount;
  const ppn = Math.round(baseAmount * 0.11);
  const effectiveDiscount = discountRemoved ? 0 : discount;
  const total = baseAmount + ppn - effectiveDiscount;
  // Discount is available only if: current/future month AND today is 1-10
  const now = new Date();
  const today = now.getDate();
  const isCurrentOrFuture = invoice.year > now.getFullYear() || (invoice.year === now.getFullYear() && invoice.month >= now.getMonth() + 1);
  const isDiscountPeriod = isCurrentOrFuture && today <= 10;

  const handleDiscountChange = (val: string) => {
    setDiscountInput(val);
    const num = parseInt(val) || 0;
    setDiscount(Math.max(0, num)); // Allow any discount, even 100%
  };

  const handlePay = async () => {
    setSaving(true);
    setError("");
    try {
      await BillingAPI.updateInvoice(invoice.id, {
        status: "paid",
        paidDate: new Date().toISOString().slice(0, 10),
        discount: effectiveDiscount,
      });
      // Show receipt
      setReceipt({
        customerName,
        packageName,
        period: `${MONTHS[invoice.month - 1]} ${invoice.year}`,
        baseAmount,
        ppn,
        discount: effectiveDiscount,
        total,
        paidDate: new Date().toISOString().slice(0, 10),
        invoiceId: invoice.id,
      });
    } catch (e: any) {
      setError(e.message);
    }
    setSaving(false);
  };

  if (receipt) {
    return (
      <ReceiptModal
        receipt={receipt}
        onClose={() => { setReceipt(null); onPaid(); }}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-[440px] !rounded-2xl shadow-[var(--shadow-xl)] anim-scale overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-light)] bg-[var(--bg-input)]/30">
          <div className="flex items-center gap-2">
            <Receipt className="w-5 h-5 text-[var(--blue)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Pembayaran Tagihan</h2>
          </div>
          <button onClick={onClose} aria-label="Tutup" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]">
            <X className="w-4 h-4 text-[var(--text-tertiary)]" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {error && <div className="p-3 rounded-xl bg-[var(--red-soft)] text-[13px] text-[var(--red)] font-medium">{error}</div>}

          {/* Invoice Info */}
          <div className="space-y-2.5">
            <div className="flex justify-between text-[13px]">
              <span className="text-[var(--text-tertiary)]">Pelanggan</span>
              <span className="font-semibold text-[var(--text-primary)]">{customerName}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-[var(--text-tertiary)]">Paket</span>
              <span className="font-medium text-[var(--text-primary)]">{packageName}</span>
            </div>
            <div className="flex justify-between text-[13px]">
              <span className="text-[var(--text-tertiary)]">Periode</span>
              <span className="font-medium text-[var(--text-primary)]">{MONTHS[invoice.month - 1]} {invoice.year}</span>
            </div>
          </div>

          {/* Calculation */}
          <div className="p-4 rounded-xl bg-[var(--bg-input)] space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Calculator className="w-4 h-4 text-[var(--text-tertiary)]" />
              <span className="text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Rincian Tagihan</span>
            </div>

            <div className="flex justify-between text-[14px]">
              <span className="text-[var(--text-secondary)]">Tagihan Pokok</span>
              <span className="font-semibold text-[var(--text-primary)] tabular-nums">{fmtRp(baseAmount)}</span>
            </div>

            <div className="flex justify-between text-[14px]">
              <span className="text-[var(--text-secondary)]">PPN 11%</span>
              <span className="font-semibold text-[var(--orange)] tabular-nums">+ {fmtRp(ppn)}</span>
            </div>

            {/* Discount Section */}
            <div className="pt-2 border-t border-[var(--border)]">
              <div className="flex items-center justify-between mb-2">
                <label className="flex items-center gap-1.5 text-[13px] font-semibold text-[var(--text-secondary)]">
                  <Tag className="w-3.5 h-3.5 text-[var(--green)]" /> Diskon
                </label>
                {!discountRemoved ? (
                  <div className="flex items-center gap-1">
                    <span className="text-[12px] text-[var(--text-quaternary)]">Rp</span>
                    <input
                      type="number"
                      value={discountInput}
                      onChange={e => handleDiscountChange(e.target.value)}
                      placeholder="0"
                      className="!w-[120px] !py-1.5 !text-[13px] !text-right !rounded-lg"
                    />
                  </div>
                ) : (
                  <span className="text-[12px] text-[var(--text-quaternary)]">Dihapus</span>
                )}
              </div>

              {/* Discount policy info */}
              {isDiscountPeriod && !discountRemoved && (
                <div className="mb-2 p-2 rounded-lg bg-[var(--green-soft)] text-[11px] text-[var(--green)] font-medium">
                  ✨ Diskon PPN berlaku tanggal 1-10 (hemat {fmtRp(ppn)})
                </div>
              )}
              {!isDiscountPeriod && !discountRemoved && discount > 0 && (
                <div className="mb-2 p-2 rounded-lg bg-[var(--orange-soft)] text-[11px] text-[var(--orange)] font-medium">
                  ⚠️ Diskon PPN hanya berlaku tanggal 1-10
                </div>
              )}

              {/* Quick actions */}
              <div className="flex gap-1.5 flex-wrap">
                {isDiscountPeriod && (
                  <button
                    type="button"
                    onClick={() => { setDiscount(ppn); setDiscountInput(String(ppn)); setDiscountRemoved(false); }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all
                      ${discount === ppn && !discountRemoved
                        ? "bg-[var(--green-soft)] text-[var(--green)] border-[var(--green)]/30"
                        : "bg-[var(--bg-card)] text-[var(--text-tertiary)] border-[var(--border)] hover:border-[var(--green)]/30"}`}
                  >
                    PPN ({fmtRp(ppn)})
                  </button>
                )}
                {!discountRemoved && discount > 0 && (
                  <button
                    type="button"
                    onClick={() => { setDiscountRemoved(true); setDiscount(0); setDiscountInput(""); }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-[var(--red-soft)] text-[var(--red)] border-[var(--red)]/20 hover:border-[var(--red)]/40"
                  >
                    Hapus Diskon
                  </button>
                )}
                {discountRemoved && isDiscountPeriod && (
                  <button
                    type="button"
                    onClick={() => { setDiscountRemoved(false); setDiscount(ppn); setDiscountInput(String(ppn)); }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold border bg-[var(--green-soft)] text-[var(--green)] border-[var(--green)]/20 hover:border-[var(--green)]/40"
                  >
                    Aktifkan Diskon PPN
                  </button>
                )}
              </div>
            </div>

            {/* Total */}
            <div className="pt-3 border-t-2 border-[var(--text-quaternary)]/20">
              <div className="flex justify-between items-center">
                <span className="text-[15px] font-bold text-[var(--text-primary)]">Total Bayar</span>
                <span className={`text-[22px] font-bold tabular-nums ${total <= 0 ? "text-[var(--green)]" : "text-[var(--blue)]"}`}>
                {total <= 0 ? "GRATIS" : fmtRp(total)}
              </span>
              </div>
              {effectiveDiscount > 0 && (
                <p className="text-[11px] text-[var(--green)] font-medium text-right mt-0.5">
                  Hemat {fmtRp(effectiveDiscount)} dari diskon
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn btn-secondary flex-1 text-[13px]">Batal</button>
            <button
              onClick={() => customer && sendInvoiceWhatsApp({ invoice: { ...invoice, discount: effectiveDiscount, ppn, totalAmount: total }, customer, packageName, packageSpeed })}
              className="btn flex-1 text-[13px] !py-3 bg-[#25D366] text-white hover:bg-[#128C7E]"
            >
              <MessageCircle className="w-4 h-4" /> Kirim WA
            </button>
            <button
              onClick={handlePay}
              disabled={saving}
              className="btn btn-primary flex-1 text-[13px] !py-3"
            >
              {saving ? "Memproses..." : (
                <>
                  <CheckCircle2 className="w-4 h-4" /> {total <= 0 ? "Bayar (Gratis)" : `Bayar ${fmtRp(total)}`}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
