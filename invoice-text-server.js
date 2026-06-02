const MONTHS = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function fmtRp(n) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
  }).format(n);
}

function generateInvoiceText({ invoice, customer, packageName, businessName = "AMANNA JATIPURO" }) {
  const base = invoice.amount;
  const ppn = invoice.ppn || Math.round(base * 0.11);
  const discount = invoice.discount || 0;
  const total = invoice.totalAmount || base + ppn - discount;
  const period = `${MONTHS[invoice.month - 1]} ${invoice.year}`;

  const lines = [];

  lines.push(`╭─────────────────────────╮`);
  lines.push(`│   📋 *NOTA TAGIHAN*    │`);
  lines.push(`╰─────────────────────────╯`);
  lines.push(``);
  lines.push(`*${businessName}*`);
  lines.push(`Internet Service Provider`);
  lines.push(``);
  lines.push(`👤 *Pelanggan:*`);
  lines.push(`   ${customer.name}`);
  if (customer.phone) lines.push(`   📱 ${customer.phone}`);
  if (customer.address) lines.push(`   📍 ${customer.address}`);
  lines.push(``);
  lines.push(`📅 *Periode:* ${period}`);
  lines.push(`📶 *Paket:* ${packageName}`);
  lines.push(`🔗 *Queue:* ${customer.simpleQueue}`);
  lines.push(``);
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

  if (invoice.status === "paid") {
    lines.push(`✅ *STATUS: LUNAS*`);
    if (invoice.paidDate) lines.push(`   Dibayar: ${invoice.paidDate}`);
  } else {
    lines.push(`⚠️ *STATUS: BELUM DIBAYAR*`);
    if (invoice.dueDate) lines.push(`   Jatuh Tempo: ${invoice.dueDate}`);
  }
  lines.push(``);
  lines.push(`Terima kasih atas kepercayaan Anda 🙏`);
  lines.push(`_Pesan ini dikirim otomatis oleh sistem billing._`);

  return lines.join("\n");
}

function generateAllUnpaidText({ invoices, customer, packageName, businessName = "AMANNA JATIPURO" }) {
  const lines = [];

  lines.push(`╭─────────────────────────╮`);
  lines.push(`│  📋 *REKAP TAGIHAN*    │`);
  lines.push(`╰─────────────────────────╯`);
  lines.push(``);
  lines.push(`*${businessName}*`);
  lines.push(`Internet Service Provider`);
  lines.push(``);
  lines.push(`👤 *Pelanggan:* ${customer.name}`);
  if (customer.phone) lines.push(`📱 *HP:* ${customer.phone}`);
  lines.push(`📶 *Paket:* ${packageName}`);
  lines.push(``);

  lines.push(`┌─────────────────────────────┐`);
  lines.push(`│  💰 *TAGIHAN BELUM BAYAR*  │`);
  lines.push(`├─────────────────────────────┤`);

  let grandTotal = 0;
  for (const inv of invoices) {
    const base = inv.amount;
    const ppn = inv.ppn || Math.round(base * 0.11);
    const disc = inv.discount || 0;
    const total = inv.totalAmount || base + ppn - disc;
    grandTotal += total;

    const period = `${MONTHS[inv.month - 1]} ${inv.year}`;
    lines.push(`│`);
    lines.push(`│ 📅 *${period}*`);
    lines.push(`│    Tagihan  ${fmtRp(base).padStart(14)}`);
    lines.push(`│    PPN 11%  ${fmtRp(ppn).padStart(14)}`);
    if (disc > 0) lines.push(`│    Diskon  -${fmtRp(disc).padStart(13)}`);
    lines.push(`│    *Subtotal ${fmtRp(total).padStart(13)}*`);
  }

  lines.push(`│`);
  lines.push(`├─────────────────────────────┤`);
  lines.push(`│ *TOTAL TAGIHAN ${fmtRp(grandTotal).padStart(14)}* │`);
  lines.push(`└─────────────────────────────┘`);
  lines.push(``);
  lines.push(`⚠️ Mohon segera lakukan pembayaran`);
  lines.push(``);
  lines.push(`Terima kasih atas kepercayaan Anda 🙏`);
  lines.push(`_Pesan ini dikirim otomatis oleh sistem billing._`);

  return lines.join("\n");
}

module.exports = { generateInvoiceText, generateAllUnpaidText };
