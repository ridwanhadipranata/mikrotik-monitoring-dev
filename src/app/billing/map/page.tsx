"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BillingAPI } from "@/lib/billing-api";
import { useBillingDevice } from "@/lib/use-billing-device";
import type { BillingCustomer, BillingPackage } from "@/lib/billing-types";
import {
  ArrowLeft, MapPin, Search, ChevronRight,
  Phone, Wifi, Users, Filter, X,
} from "lucide-react";

import BillingNav from "@/components/BillingNav";
const DeviceSelector = dynamic(() => import("@/components/DeviceSelector"), { ssr: false });
const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

function statusColor(s: string) {
  return s === "active" ? "#34C759" : s === "suspended" ? "#FF9500" : "#FF3B30";
}

function statusLabel(s: string) {
  return s === "active" ? "Aktif" : s === "suspended" ? "Suspended" : "Putus";
}

function statusBadgeClass(s: string) {
  return s === "active" ? "badge badge-green" : s === "suspended" ? "badge badge-orange" : "badge badge-red";
}

export default function BillingMapPage() {
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "active" | "suspended" | "terminated">("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { device, setDevice } = useBillingDevice();

  useEffect(() => {
    if (!device) { setLoading(false); return; }
    setLoading(true);
    Promise.all([BillingAPI.getCustomers(device), BillingAPI.getPackages(device)])
      .then(([c, p]) => { setCustomers(c); setPackages(p); })
      .finally(() => setLoading(false));
  }, [device]);

  const getPackageName = (id: string) => packages.find(p => p.id === id)?.name || "-";

  const filtered = useMemo(() => {
    let list = filter === "all" ? customers : customers.filter(c => c.status === filter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.simpleQueue.toLowerCase().includes(q) ||
        (c.phone || "").includes(q)
      );
    }
    return list;
  }, [customers, filter, search]);

  const withCoords = filtered.filter(c => c.lat && c.lng);
  const activeCount = customers.filter(c => c.status === "active").length;
  const suspendedCount = customers.filter(c => c.status === "suspended").length;
  const terminatedCount = customers.filter(c => c.status === "terminated").length;
  const totalWithCoords = customers.filter(c => c.lat && c.lng).length;

  return (
    <div className="h-[100dvh] flex flex-col bg-[var(--bg-base)]">
      {/* ── Top Bar ── */}
      <div className="flex-shrink-0 border-b border-[var(--border)] bg-[var(--bg-card)]/80 backdrop-blur-xl z-20">
        <div className="flex items-center gap-3 px-4 sm:px-6 py-3">
          <Link href="/billing" className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
            <ArrowLeft className="w-4 h-4 text-[var(--text-secondary)]" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-[16px] sm:text-[18px] font-bold text-[var(--text-primary)] tracking-[-0.02em]">Peta Pelanggan</h1>
          </div>

          <DeviceSelector value={device} onChange={setDevice} />

          {/* Stats pills */}
          <div className="hidden sm:flex items-center gap-2">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--green-soft)] text-[11px] font-semibold text-[var(--green)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--green)]" /> {activeCount}
            </span>
            {suspendedCount > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--orange-soft)] text-[11px] font-semibold text-[var(--orange)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--orange)]" /> {suspendedCount}
              </span>
            )}
            {terminatedCount > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--red-soft)] text-[11px] font-semibold text-[var(--red)]">
                <span className="w-1.5 h-1.5 rounded-full bg-[var(--red)]" /> {terminatedCount}
              </span>
            )}
            <span className="text-[11px] text-[var(--text-quaternary)] ml-1">
              {totalWithCoords}/{customers.length} di peta
            </span>
          </div>

          {/* Toggle sidebar (mobile) */}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors"
          >
            <Users className="w-4 h-4 text-[var(--text-secondary)]" />
          </button>
        </div>

        <BillingNav current="/billing/map" />

        {/* Filter bar */}
        <div className="flex items-center gap-2 px-4 sm:px-6 pb-3 overflow-x-auto">
          <Filter className="w-3.5 h-3.5 text-[var(--text-quaternary)] flex-shrink-0" />
          {([["all", "Semua"], ["active", "Aktif"], ["suspended", "Suspended"], ["terminated", "Putus"]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setFilter(key)}
              className={`flex-shrink-0 px-3 py-1 rounded-full text-[11px] font-semibold transition-all border
                ${filter === key
                  ? "bg-[var(--blue)] text-white border-[var(--blue)] shadow-[0_2px_8px_rgba(0,122,255,0.25)]"
                  : "bg-[var(--bg-card)] text-[var(--text-tertiary)] border-[var(--border)] hover:border-[var(--blue)]/30 hover:text-[var(--text-secondary)]"
                }`}
            >
              {label}
              {key === "all" && <span className="ml-1 opacity-70">{customers.length}</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Map */}
        <div className="flex-1 relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--bg-base)]">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-[var(--border)] border-t-[var(--blue)] rounded-full animate-spin" />
                <p className="text-[13px] text-[var(--text-tertiary)]">Loading peta...</p>
              </div>
            </div>
          ) : (
            <MapPicker
              lat={null}
              lng={null}
              onChange={() => {}}
              height="100%"
              customers={filtered.map(c => ({
                name: c.name,
                lat: c.lat,
                lng: c.lng,
                status: c.status,
                simpleQueue: c.simpleQueue,
                phone: c.phone,
              }))}
              showAllMarkers
            />
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className={`
          absolute lg:relative right-0 top-0 bottom-0 z-10
          w-[320px] lg:w-[340px]
          bg-[var(--bg-card)] border-l border-[var(--border)]
          flex flex-col transition-transform duration-300 ease-out
          ${sidebarOpen ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
          shadow-[-8px_0_30px_rgba(0,0,0,0.08)] dark:shadow-[-8px_0_30px_rgba(0,0,0,0.3)]
        `}>
          {/* Sidebar header */}
          <div className="flex-shrink-0 px-4 py-3 border-b border-[var(--border-light)]">
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-[14px] font-bold text-[var(--text-primary)]">Pelanggan</h3>
              <button
                onClick={() => setSidebarOpen(false)}
                className="lg:hidden w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]"
              >
                <X className="w-4 h-4 text-[var(--text-tertiary)]" />
              </button>
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--text-quaternary)]" />
              <input
                type="text"
                placeholder="Cari nama, queue, telp..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="!pl-9 !pr-3 !py-2 !text-[12px] !rounded-xl"
              />
            </div>
          </div>

          {/* Customer list */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-8 text-center">
                <MapPin className="w-10 h-10 text-[var(--text-quaternary)] mx-auto mb-3 opacity-40" />
                <p className="text-[13px] font-semibold text-[var(--text-secondary)]">
                  {search ? "Tidak ditemukan" : "Belum ada pelanggan"}
                </p>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                  {search ? "Coba kata kunci lain" : "Tambah pelanggan di menu Billing"}
                </p>
              </div>
            ) : filtered.map(c => {
              const hasCoords = c.lat && c.lng;
              const isSelected = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedId(isSelected ? null : c.id)}
                  className={`px-4 py-3 border-b border-[var(--border-light)] cursor-pointer transition-all
                    ${isSelected ? "bg-[var(--blue-soft)]" : "hover:bg-[var(--bg-hover)]"}`}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Status dot */}
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-[11px] font-bold"
                      style={{ backgroundColor: statusColor(c.status) }}
                    >
                      {c.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">{c.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <code className="text-[10px] text-[var(--blue)] bg-[var(--blue-soft)] px-1.5 py-0.5 rounded font-mono">{c.simpleQueue}</code>
                        <span className={statusBadgeClass(c.status) + " text-[9px]"}>{statusLabel(c.status)}</span>
                      </div>
                    </div>
                    {hasCoords && (
                      <MapPin className="w-3.5 h-3.5 text-[var(--green)] flex-shrink-0" />
                    )}
                  </div>

                  {/* Expanded info */}
                  {isSelected && (
                    <div className="mt-2.5 ml-[42px] space-y-1.5 anim-slide">
                      <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                        <Wifi className="w-3 h-3" />
                        <span>{getPackageName(c.packageId)}</span>
                      </div>
                      {c.phone && (
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                          <Phone className="w-3 h-3" />
                          <span>{c.phone}</span>
                        </div>
                      )}
                      {hasCoords ? (
                        <div className="flex items-center gap-2 text-[11px] text-[var(--blue)]">
                          <MapPin className="w-3 h-3" />
                          <span>{c.lat!.toFixed(6)}, {c.lng!.toFixed(6)}</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-quaternary)]">
                          <MapPin className="w-3 h-3" />
                          <span>Belum ada koordinat</span>
                        </div>
                      )}
                      <Link
                        href="/billing/customers"
                        className="inline-flex items-center gap-1 text-[11px] text-[var(--blue)] font-medium hover:underline mt-1"
                      >
                        Edit pelanggan <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Sidebar footer */}
          <div className="flex-shrink-0 px-4 py-2.5 border-t border-[var(--border-light)] bg-[var(--bg-input)]/30">
            <p className="text-[10px] text-[var(--text-quaternary)] text-center">
              {filtered.length} pelanggan · {withCoords.length} di peta
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
