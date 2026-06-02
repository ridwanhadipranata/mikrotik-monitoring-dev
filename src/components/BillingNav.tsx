"use client";

import Link from "next/link";
import {
  CreditCard, Users, Package, FileText, MapPin,
  Calendar, MessageCircle, Database, Clock,
} from "lucide-react";

const tabs = [
  { href: "/billing", label: "Overview", icon: CreditCard },
  { href: "/billing/customers", label: "Pelanggan", icon: Users },
  { href: "/billing/invoices", label: "Tagihan", icon: FileText },
  { href: "/billing/history", label: "Riwayat", icon: Clock },
  { href: "/billing/packages", label: "Paket", icon: Package },
  { href: "/billing/monthly", label: "Bulanan", icon: Calendar },
  { href: "/billing/whatsapp", label: "WhatsApp", icon: MessageCircle },
  { href: "/billing/map", label: "Peta", icon: MapPin },
  { href: "/billing/backup", label: "Backup", icon: Database },
];

export default function BillingNav({ current }: { current: string }) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
      {tabs.map(t => {
        const active = current === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={`flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-all
              ${active
                ? "bg-[var(--blue)] text-white shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
                : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
              }`}
          >
            <t.icon className="w-3.5 h-3.5" />
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
