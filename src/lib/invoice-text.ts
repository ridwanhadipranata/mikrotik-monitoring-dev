import type { BillingInvoice, BillingCustomer, BillingPackage } from "./billing-types";
import { getEffectiveDiscount } from "./billing-types";

const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const fmtRp = (n: number) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);

interface InvoiceData {
  invoice: BillingInvoice;
  customer: BillingCustomer;
  packageName: string;
  packageSpeed?: { up: string; down: string };
  businessName?: string;
}

export function generateInvoiceText({
  invoice,
  customer,
  packageName,
  packageSpeed,
  businessName = "AMANNA JATIPURO",
}: InvoiceData): string {
  const base = invoice.amount;
  const ppn = invoice.ppn || Math.round(base * 0.11);
  const discount = getEffectiveDiscount(invoice);
  const total = base + ppn - discount;
  const period = `${MONTHS[invoice.month - 1]} ${invoice.year}`;

  const lines: string[] = [];

  // Header
  lines.push(`╭─────────────────────────╮`);
  lines.push(`│   📋 *NOTA TAGIHAN*    │`);
  lines.push(`╰─────────────────────────╯`);
  lines.push(``);
  lines.push(`*${businessName}*`);
  lines.push(`Internet Service Provider`);
  lines.push(``);

  // Info pelanggan
  lines.push(`👤 *Pelanggan:*`);
  lines.push(`   ${customer.name}`);
  if (customer.phone) lines.push(`   📱 ${customer.phone}`);
  if (customer.address) lines.push(`   📍 ${customer.address}`);
  lines.push(``);

  // Info tagihan
  lines.push(`📅 *Periode:* ${period}`);
  lines.push(`📶 *Paket:* ${packageName}`);
  if (packageSpeed) lines.push(`🚀 *Kecepatan:* ${packageSpeed.up} ↑ / ${packageSpeed.down} ↓`);
  lines.push(`🔗 *Queue:* ${customer.simpleQueue}`);
  lines.push(``);

  // Rincian
  lines.push(`┌─────────────────────────┐`);
  lines.push(`│  💰 *RINCIAN TAGIHAN*  │`);
  lines.push(`├─────────────────────────┤`);
  lines.push(`│ Tagihan    ${fmtRp(base).padStart(14)} │`);
  lines.push(`│ PPN 11%    ${fmtRp(ppn).padStart(14)} │`);
  if (discount > 0) {
    lines.push(`│ Diskon    -${fmtRp(discount).padStart(13)} │`);
  }
  lines.push(`├─────────────────────────┤`);
  lines.push(`│ *TOTAL*   ${fmtRp(total).padStart(14)}* │`);
  lines.push(`└─────────────────────────┘`);
  lines.push(``);

  // Status
  if (invoice.status === "paid") {
    lines.push(`✅ *STATUS: LUNAS*`);
    if (invoice.paidDate) lines.push(`   Dibayar: ${invoice.paidDate}`);
  } else {
    lines.push(`⚠️ *STATUS: BELUM DIBAYAR*`);
    if (invoice.dueDate) lines.push(`   Jatuh Tempo: ${invoice.dueDate}`);
  }
  lines.push(``);

  // Footer
  lines.push(`Terima kasih atas kepercayaan Anda 🙏`);
  lines.push(`_Pesan ini dikirim otomatis oleh sistem billing._`);

  return lines.join("\n");
}

export function generateWhatsAppUrl(
  phone: string,
  text: string
): string {
  // Clean phone number: remove spaces, dashes, +62 prefix handling
  let cleaned = phone.replace(/[\s\-()]/g, "");
  if (cleaned.startsWith("0")) cleaned = "62" + cleaned.slice(1);
  if (cleaned.startsWith("+")) cleaned = cleaned.slice(1);
  if (!cleaned.startsWith("62")) cleaned = "62" + cleaned;

  const encoded = encodeURIComponent(text);
  return `https://wa.me/${cleaned}?text=${encoded}`;
}

export function sendInvoiceWhatsApp({
  invoice,
  customer,
  packageName,
  packageSpeed,
  businessName,
}: InvoiceData): void {
  if (!customer.phone) {
    alert("Pelanggan tidak memiliki nomor telepon");
    return;
  }

  const text = generateInvoiceText({ invoice, customer, packageName, packageSpeed, businessName });
  const url = generateWhatsAppUrl(customer.phone, text);

  window.open(url, "_blank");
}
