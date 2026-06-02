"use client";

import { useState, useRef, useEffect } from "react";
import { X, Download, Share2, FileImage, FileText, CheckCircle2, MessageCircle, Loader2 } from "lucide-react";

const fmtRp = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);

export interface ReceiptData {
  customerName: string;
  packageName: string;
  period: string;
  baseAmount: number;
  ppn: number;
  discount: number;
  total: number;
  paidDate: string;
  invoiceId: string;
}

interface ReceiptModalProps {
  receipt: ReceiptData;
  onClose: () => void;
}

// Load logo image once, cache it
let logoCache: HTMLImageElement | null = null;
function loadLogo(): Promise<HTMLImageElement | null> {
  if (logoCache) return Promise.resolve(logoCache);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { logoCache = img; resolve(img); };
    img.onerror = () => resolve(null);
    img.src = "/monitoring/logo.png";
  });
}

// Generate receipt as canvas with logo
async function renderReceiptCanvas(r: ReceiptData): Promise<HTMLCanvasElement> {
  const W = 800;
  const pad = 48;
  let y = 0;
  const lineHeight = 36;

  // Load logo
  const logo = await loadLogo();
  const logoSize = logo ? 72 : 0;
  const logoGap = logo ? 16 : 0;

  // Pre-calculate height
  let totalH = pad; // top padding
  if (logo) totalH += logoSize + logoGap; // logo
  totalH += 44; // "Bukti Pembayaran" title
  totalH += 16; // subtitle
  totalH += 20; // gap
  totalH += 60; // success icon
  totalH += 20; // gap
  totalH += 30; // "Total Dibayar"
  totalH += 50; // amount
  if (r.discount > 0) totalH += 28;
  totalH += 30; // gap
  totalH += lineHeight * 4; // details
  totalH += 20; // separator
  totalH += lineHeight; // base
  totalH += lineHeight; // ppn
  if (r.discount > 0) totalH += lineHeight;
  totalH += 20; // separator
  totalH += lineHeight; // total
  totalH += 30; // gap
  totalH += 28; // thanks
  totalH += 22; // id
  totalH += pad; // bottom

  const canvas = document.createElement("canvas");
  canvas.width = W * 2;
  canvas.height = totalH * 2;
  canvas.style.width = W + "px";
  canvas.style.height = totalH + "px";
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);

  // Background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, totalH);

  // Helpers
  const centerText = (text: string, yPos: number, size: number, color: string, bold = false) => {
    ctx.fillStyle = color;
    ctx.font = `${bold ? "bold " : ""}${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(text, W / 2, yPos);
    ctx.textAlign = "left";
  };

  const row = (label: string, value: string, yPos: number, labelColor = "#6b7280", valueColor = "#111827", valueBold = false, valueSize = 15) => {
    ctx.fillStyle = labelColor;
    ctx.font = `14px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(label, pad, yPos);
    ctx.fillStyle = valueColor;
    ctx.font = `${valueBold ? "bold " : ""}${valueSize}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(value, W - pad, yPos);
    ctx.textAlign = "left";
  };

  const drawLine = (yPos: number, dashed = true) => {
    ctx.strokeStyle = "#d1d5db";
    ctx.lineWidth = 1;
    if (dashed) ctx.setLineDash([6, 4]); else ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(pad, yPos);
    ctx.lineTo(W - pad, yPos);
    ctx.stroke();
    ctx.setLineDash([]);
  };

  y = pad;

  // Logo
  if (logo) {
    const lx = (W - logoSize) / 2;
    ctx.drawImage(logo, lx, y, logoSize, logoSize);
    y += logoSize + logoGap;
  }

  // Title
  centerText("Bukti Pembayaran", y + 22, 22, "#111827", true);
  centerText("Amanna Billing System", y + 40, 13, "#6b7280");
  y += 52;
  drawLine(y, true);
  y += 20;

  // Success circle
  ctx.beginPath();
  ctx.arc(W / 2, y + 25, 25, 0, Math.PI * 2);
  ctx.fillStyle = "#dcfce7";
  ctx.fill();
  ctx.strokeStyle = "#16a34a";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(W / 2 - 10, y + 25);
  ctx.lineTo(W / 2 - 2, y + 33);
  ctx.lineTo(W / 2 + 12, y + 17);
  ctx.stroke();
  y += 70;

  centerText("Total Dibayar", y, 13, "#6b7280");
  y += 30;
  centerText(fmtRp(r.total), y, 32, "#111827", true);
  y += 42;

  if (r.discount > 0) {
    centerText(`Hemat ${fmtRp(r.discount)} dari diskon`, y, 12, "#16a34a", true);
    y += 28;
  }
  y += 20;

  row("Pelanggan", r.customerName, y, "#6b7280", "#111827", true); y += lineHeight;
  row("Paket", r.packageName, y); y += lineHeight;
  row("Periode", r.period, y); y += lineHeight;
  row("Tanggal Bayar", r.paidDate, y); y += lineHeight;

  y += 10; drawLine(y, true); y += 16;
  row("Tagihan Pokok", fmtRp(r.baseAmount), y); y += lineHeight;
  row("PPN 11%", fmtRp(r.ppn), y); y += lineHeight;
  if (r.discount > 0) { row("Diskon", `- ${fmtRp(r.discount)}`, y, "#6b7280", "#16a34a", true); y += lineHeight; }

  y += 10; drawLine(y, false); y += 16;
  row("Total Bayar", fmtRp(r.total), y, "#111827", "#007aff", true, 18); y += lineHeight;

  y += 20;
  centerText("Terima kasih atas pembayaran Anda! 🙏", y, 13, "#6b7280");
  y += 22;
  centerText(`ID: ${r.invoiceId}`, y, 10, "#9ca3af");

  return canvas;
}

export default function ReceiptModal({ receipt, onClose }: ReceiptModalProps) {
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderReceiptCanvas(receipt).then(canvas => {
      if (cancelled) return;
      canvasRef.current = canvas;
      setPreviewUrl(canvas.toDataURL("image/png"));
    });
    return () => { cancelled = true; };
  }, [receipt]);

  const receiptText = [
    `✅ BUKTI PEMBAYARAN`,
    `━━━━━━━━━━━━━━━━━━`,
    `👤 Pelanggan: ${receipt.customerName}`,
    `📦 Paket: ${receipt.packageName}`,
    `📅 Periode: ${receipt.period}`,
    `📆 Tanggal Bayar: ${receipt.paidDate}`,
    `──────────────────`,
    `Tagihan Pokok: ${fmtRp(receipt.baseAmount)}`,
    `PPN 11%: ${fmtRp(receipt.ppn)}`,
    receipt.discount > 0 ? `Diskon: -${fmtRp(receipt.discount)}` : null,
    `──────────────────`,
    `💰 TOTAL BAYAR: ${fmtRp(receipt.total)}`,
    `━━━━━━━━━━━━━━━━━━`,
    `Terima kasih atas pembayaran Anda! 🙏`,
  ].filter(Boolean).join("\n");

  const getBlob = async (): Promise<Blob> => {
    const canvas = canvasRef.current;
    if (!canvas) throw new Error("Canvas not ready");
    return new Promise((resolve, reject) => {
      canvas.toBlob((b) => { if (b) resolve(b); else reject(new Error("Failed")); }, "image/png");
    });
  };

  const handleDownloadImage = async () => {
    setGenerating(true);
    try {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const link = document.createElement("a");
      link.download = `bukti-bayar-${receipt.customerName.replace(/\s+/g, "-")}.png`;
      link.href = canvas.toDataURL("image/png");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) { console.error(e); }
    setGenerating(false);
  };

  const handleDownloadPDF = async () => {
    setGenerating(true);
    try {
      const { default: jsPDF } = await import("jspdf");
      const canvas = canvasRef.current;
      if (!canvas) return;
      const imgData = canvas.toDataURL("image/png");
      const ratio = canvas.height / canvas.width;
      const pdfW = 210;
      const pdfH = pdfW * ratio;
      const pdf = new jsPDF({ unit: "mm", format: [pdfW, Math.max(pdfH + 20, 297)] });
      pdf.addImage(imgData, "PNG", 0, 10, pdfW, pdfH);
      pdf.save(`bukti-bayar-${receipt.customerName.replace(/\s+/g, "-")}.pdf`);
    } catch (e) { console.error(e); alert("Gagal membuat PDF."); }
    setGenerating(false);
  };

  const handleShare = async () => {
    setGenerating(true);
    try {
      const blob = await getBlob();
      const file = new File([blob], `bukti-bayar-${receipt.customerName}.png`, { type: "image/png" });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ title: `Bukti Pembayaran - ${receipt.customerName}`, text: receiptText, files: [file] }); }
        catch (e: any) { if (e.name === "AbortError") { setGenerating(false); return; } await navigator.share({ title: `Bukti Pembayaran`, text: receiptText }); }
      } else if (navigator.share) { await navigator.share({ title: `Bukti Pembayaran`, text: receiptText }); }
      else { await handleDownloadImage(); }
    } catch (e: any) { if (e.name !== "AbortError") await handleDownloadImage(); }
    setGenerating(false);
  };

  const handleWhatsApp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(receiptText)}`, "_blank");
  };

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-[440px] !rounded-2xl shadow-[var(--shadow-xl)] anim-scale overflow-hidden max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-light)] bg-[var(--green-soft)]">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-[var(--green)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Pembayaran Berhasil!</h2>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]">
            <X className="w-4 h-4 text-[var(--text-tertiary)]" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {previewUrl ? (
            <div className="rounded-xl overflow-hidden border border-gray-200 bg-white">
              <img src={previewUrl} alt="Bukti Pembayaran" className="w-full h-auto" />
            </div>
          ) : (
            <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
              <Loader2 className="w-6 h-6 animate-spin text-[var(--text-quaternary)] mx-auto" />
              <p className="text-[13px] text-[var(--text-tertiary)] mt-2">Membuat bukti pembayaran...</p>
            </div>
          )}

          <div className="space-y-2.5">
            <button onClick={handleShare} disabled={generating || !previewUrl} className="btn w-full !py-3.5 !text-[14px] !font-semibold bg-[var(--blue)] text-white hover:bg-[var(--blue-hover)] shadow-[0_2px_8px_rgba(0,122,255,0.3)]">
              {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
              {generating ? "Membuat..." : "Share Bukti Pembayaran"}
            </button>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={handleDownloadImage} disabled={generating || !previewUrl} className="btn btn-secondary !py-2.5 !text-[12px] flex-col gap-1"><FileImage className="w-4 h-4" />Gambar</button>
              <button onClick={handleDownloadPDF} disabled={generating || !previewUrl} className="btn btn-secondary !py-2.5 !text-[12px] flex-col gap-1"><FileText className="w-4 h-4" />PDF</button>
              <button onClick={handleWhatsApp} disabled={generating} className="btn btn-secondary !py-2.5 !text-[12px] flex-col gap-1 !text-[#25D366]"><MessageCircle className="w-4 h-4" />WhatsApp</button>
            </div>
          </div>
          <button onClick={onClose} className="btn btn-secondary w-full !text-[13px]">Tutup</button>
        </div>
      </div>
    </div>
  );
}
