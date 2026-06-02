"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BillingAPI } from "@/lib/billing-api";
import { useBillingDevice } from "@/lib/use-billing-device";
import type { BillingCustomer, BillingPackage, BillingQueue } from "@/lib/billing-types";
import {
  Users, Plus, Edit3, Trash2, ArrowLeft, X, Save,
  Search, Network, ChevronDown, Check, Loader2, AlertCircle, MapPin,
} from "lucide-react";

import BillingNav from "@/components/BillingNav";
const DeviceSelector = dynamic(() => import("@/components/DeviceSelector"), { ssr: false });
const MapPicker = dynamic(() => import("@/components/MapPicker"), { ssr: false });

function formatRate(bps: number): string {
  if (bps >= 1000000) return `${(bps / 1000000).toFixed(1)} Mbps`;
  if (bps >= 1000) return `${(bps / 1000).toFixed(0)} Kbps`;
  return `${bps} bps`;
}

function QueueSelector({ queues, value, onChange, usedQueues, loading }: {
  queues: BillingQueue[]; value: string; onChange: (v: string) => void;
  usedQueues: Set<string>; loading: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 50); }, [open]);

  const filtered = queues.filter(q =>
    q.name.toLowerCase().includes(search.toLowerCase()) ||
    q.target.toLowerCase().includes(search.toLowerCase()) ||
    (q.comment || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => { setOpen(!open); setSearch(""); }}
        className="w-full flex items-center gap-2 px-3 py-3 rounded-[14px] bg-[var(--bg-input)] border border-[var(--border)] text-left transition-all duration-200 hover:border-[var(--blue)]/30 focus:outline-none focus:border-[var(--blue)]/50 focus:shadow-[0_0_0_3px_rgba(0,122,255,0.1)]">
        <Network className="w-4 h-4 text-[var(--text-quaternary)] flex-shrink-0" />
        <span className={`flex-1 text-[14px] truncate ${value ? "text-[var(--text-primary)] font-medium" : "text-[var(--text-quaternary)]"}`}>
          {value || "Pilih simple queue..."}
        </span>
        {loading && <Loader2 className="w-4 h-4 text-[var(--text-quaternary)] animate-spin" />}
        <ChevronDown className={`w-4 h-4 text-[var(--text-quaternary)] transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 right-0 mt-1.5 z-50 bg-[var(--bg-card)] border border-[var(--border)] rounded-[14px] shadow-[var(--shadow-xl)] overflow-hidden anim-slide">
          <div className="p-2.5 border-b border-[var(--border-light)]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-quaternary)]" />
              <input ref={inputRef} type="text" placeholder="Cari queue..." value={search} onChange={e => setSearch(e.target.value)}
                className="!pl-9 !pr-3 !py-2 !text-[13px] !rounded-[10px] !bg-[var(--bg-input)]" />
            </div>
          </div>
          <div className="max-h-[260px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-[13px] text-[var(--text-tertiary)]">{loading ? "Loading queues..." : "Tidak ditemukan"}</div>
            ) : filtered.map(q => {
              const isUsed = usedQueues.has(q.name);
              const isUsedByOther = isUsed && q.name !== value;
              const isSelected = q.name === value;
              return (
                <button key={q.name} type="button" disabled={isUsedByOther}
                  onClick={() => { onChange(q.name); setOpen(false); setSearch(""); }}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors
                    ${isSelected ? "bg-[var(--blue-soft)]" : isUsedByOther ? "opacity-40 cursor-not-allowed" : "hover:bg-[var(--bg-hover)] cursor-pointer"}`}>
                  <div className={`w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0 ${isSelected ? "bg-[var(--blue)]" : "bg-[var(--bg-input)]"}`}>
                    {isSelected ? <Check className="w-4 h-4 text-white" /> : <Network className="w-4 h-4 text-[var(--text-tertiary)]" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] font-semibold truncate ${isSelected ? "text-[var(--blue)]" : "text-[var(--text-primary)]"}`}>{q.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {q.target && <span className="text-[11px] text-[var(--text-tertiary)] font-mono">{q.target}</span>}
                      {q.maxDownload !== "0" && <span className="text-[11px] text-[var(--text-tertiary)]">↓{formatRate(parseInt(q.maxDownload))} ↑{formatRate(parseInt(q.maxUpload))}</span>}
                    </div>
                  </div>
                  {isUsedByOther && <span className="text-[10px] text-[var(--orange)] font-medium bg-[var(--orange-soft)] px-2 py-0.5 rounded-md flex-shrink-0">Used: {q.usedBy}</span>}
                  {q.disabled && <span className="text-[10px] text-[var(--text-quaternary)] font-medium bg-[var(--bg-input)] px-2 py-0.5 rounded-md flex-shrink-0">Off</span>}
                </button>
              );
            })}
          </div>
          <div className="px-3 py-2 border-t border-[var(--border-light)] bg-[var(--bg-input)]/50">
            <p className="text-[11px] text-[var(--text-tertiary)]">{filtered.length} queue · {filtered.filter(q => !usedQueues.has(q.name)).length} tersedia</p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<BillingCustomer[]>([]);
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [queues, setQueues] = useState<BillingQueue[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", address: "", phone: "", packageId: "", simpleQueue: "", billingDay: "1", status: "active" as string, installDate: "", lat: null as number | null, lng: null as number | null });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const { device, setDevice } = useBillingDevice();

  const load = (dev?: string) => {
    const d = dev || device;
    if (!d) return Promise.resolve();
    return Promise.all([BillingAPI.getCustomers(d), BillingAPI.getPackages(d)]).then(([c, p]) => { setCustomers(c); setPackages(p); });
  };
  useEffect(() => { if (!device) { setLoading(false); return; } load(device)?.finally(() => setLoading(false)); }, [device]);

  const loadQueues = () => {
    setQueueLoading(true);
    BillingAPI.getQueues(device).then(setQueues).catch(() => {}).finally(() => setQueueLoading(false));
  };

  const usedQueues = new Set(customers.map(c => c.simpleQueue));
  const getPackageName = (id: string) => packages.find(p => p.id === id)?.name || "-";

  const openAdd = () => {
    setEditId(null);
    setForm({ name: "", address: "", phone: "", packageId: "", simpleQueue: "", billingDay: "1", status: "active", installDate: new Date().toISOString().slice(0, 10), lat: null, lng: null });
    setError(""); setShowForm(true);
    load(device); // Reload fresh data
    loadQueues();
  };

  const openEdit = (c: BillingCustomer) => {
    setEditId(c.id);
    setForm({ name: c.name, address: c.address, phone: c.phone, packageId: c.packageId, simpleQueue: c.simpleQueue, billingDay: String(c.billingDay), status: c.status, installDate: c.installDate, lat: c.lat, lng: c.lng });
    setError(""); setShowForm(true);
    load(device);
    loadQueues();
  };

  const handleSave = async () => {
    if (!form.name || !form.packageId || !form.simpleQueue) { setError("Nama, paket, dan simple queue wajib diisi"); return; }
    setSaving(true); setError("");
    try {
      const data = { name: form.name, address: form.address, phone: form.phone, packageId: form.packageId, simpleQueue: form.simpleQueue, billingDay: Number(form.billingDay), status: form.status as BillingCustomer["status"], installDate: form.installDate, lat: form.lat, lng: form.lng, deviceId: device };
      if (editId) await BillingAPI.updateCustomer(editId, data);
      else await BillingAPI.createCustomer(data);
      setShowForm(false); load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus pelanggan "${name}"?`)) return;
    try { await BillingAPI.deleteCustomer(id); load(); } catch {}
  };

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.simpleQueue.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  const statusBadge = (s: string) => {
    if (s === "active") return <span className="badge badge-green text-[10px]">Aktif</span>;
    if (s === "suspended") return <span className="badge badge-orange text-[10px]">Suspended</span>;
    return <span className="badge badge-red text-[10px]">Putus</span>;
  };

  return (
    <div className="p-5 sm:p-8 space-y-6 max-w-[1200px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/billing" className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.025em]">Pelanggan</h1>
            <p className="text-[13px] text-[var(--text-tertiary)]">{customers.length} pelanggan terdaftar</p>
          </div>
          <DeviceSelector value={device} onChange={setDevice} />
        </div>
        <button onClick={openAdd} className="btn btn-primary text-[13px]"><Plus className="w-4 h-4" /> Tambah Pelanggan</button>
      </div>

      <BillingNav current="/billing/customers" />

      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-quaternary)]" />
        <input type="text" placeholder="Cari nama, queue, atau telepon..." value={search} onChange={e => setSearch(e.target.value)} className="!pl-10 !py-2.5 !text-[13px] !rounded-xl max-w-[360px]" />
      </div>

      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-[520px] p-6 !rounded-2xl shadow-[var(--shadow-xl)] anim-scale max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-bold text-[var(--text-primary)]">{editId ? "Edit Pelanggan" : "Tambah Pelanggan"}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]"><X className="w-4 h-4 text-[var(--text-tertiary)]" /></button>
            </div>
            {error && <div className="mb-4 flex items-start gap-2.5 p-3 rounded-xl bg-[var(--red-soft)]"><AlertCircle className="w-4 h-4 text-[var(--red)] flex-shrink-0 mt-0.5" /><p className="text-[13px] text-[var(--red)] font-medium">{error}</p></div>}
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Nama Pelanggan</label>
                <input type="text" placeholder="Nama lengkap" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Simple Queue (Mikrotik)</label>
                <QueueSelector queues={queues} value={form.simpleQueue} onChange={v => setForm({...form, simpleQueue: v})}
                  usedQueues={editId ? new Set([...usedQueues].filter(q => q !== form.simpleQueue)) : usedQueues} loading={queueLoading} />
                <p className="text-[11px] text-[var(--text-tertiary)]">Pilih dari simple queue di Mikrotik. Queue yang sudah dipakai pelanggan lain tidak bisa dipilih.</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Paket</label>
                <select value={form.packageId} onChange={e => setForm({...form, packageId: e.target.value})}>
                  <option value="">-- Pilih Paket --</option>
                  {packages.map(p => <option key={p.id} value={p.id}>{p.name} — Rp {p.price.toLocaleString("id-ID")}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Telepon</label>
                  <input type="text" placeholder="08xxx" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Tanggal Tagihan</label>
                  <select value={form.billingDay} onChange={e => setForm({...form, billingDay: e.target.value})}>
                    {Array.from({length: 28}, (_, i) => i + 1).map(d => <option key={d} value={d}>Tanggal {d}</option>)}
                  </select>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Alamat</label>
                <input type="text" placeholder="Alamat (opsional)" value={form.address} onChange={e => setForm({...form, address: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5" /> Lokasi (Klik di peta atau cari alamat)
                </label>
                <MapPicker
                  lat={form.lat}
                  lng={form.lng}
                  onChange={(newLat, newLng) => setForm({...form, lat: newLat, lng: newLng})}
                  height="220px"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Tanggal Pasang</label>
                  <input type="date" value={form.installDate} onChange={e => setForm({...form, installDate: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Status</label>
                  <select value={form.status} onChange={e => setForm({...form, status: e.target.value})}>
                    <option value="active">Aktif</option>
                    <option value="suspended">Suspended</option>
                    <option value="terminated">Putus</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="btn btn-secondary flex-1 text-[13px]">Batal</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 text-[13px]">
                {saving ? "Menyimpan..." : <><Save className="w-4 h-4" /> Simpan</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="card p-10 text-center">
          <Users className="w-12 h-12 text-[var(--text-quaternary)] mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-[var(--text-secondary)]">{search ? "Tidak ditemukan" : "Belum ada pelanggan"}</p>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1">{search ? "Coba kata kunci lain" : "Daftarkan pelanggan pertama"}</p>
          {!search && <button onClick={openAdd} className="btn btn-primary mt-4 text-[13px]"><Plus className="w-4 h-4" /> Tambah Pelanggan</button>}
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead><tr><th>Pelanggan</th><th>Queue</th><th>Paket</th><th>Tagihan</th><th>Status</th><th>Pasang</th><th className="text-right">Aksi</th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td><div><p className="font-semibold text-[13px]">{c.name}</p>{c.phone && <p className="text-[11px] text-[var(--text-tertiary)]">{c.phone}</p>}</div></td>
                    <td><code className="text-[12px] bg-[var(--bg-input)] px-2 py-0.5 rounded-md font-mono text-[var(--blue)]">{c.simpleQueue}</code></td>
                    <td className="text-[13px]">{getPackageName(c.packageId)}</td>
                    <td className="text-[13px] font-medium tabular-nums">Tgl {c.billingDay}</td>
                    <td>{statusBadge(c.status)}</td>
                    <td className="text-[12px] text-[var(--text-tertiary)]">{c.installDate}</td>
                    <td className="text-right">
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => openEdit(c)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--blue)]"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => handleDelete(c.id, c.name)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--red-soft)] text-[var(--text-tertiary)] hover:text-[var(--red)]"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
