"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { BillingAPI } from "@/lib/billing-api";
import { useBillingDevice } from "@/lib/use-billing-device";
import type { BillingPackage } from "@/lib/billing-types";
import {
  Package,
  Plus,
  Edit3,
  Trash2,
  ArrowLeft,
  X,
  Wifi,
  Save,
} from "lucide-react";

import BillingNav from "@/components/BillingNav";
const DeviceSelector = dynamic(() => import("@/components/DeviceSelector"), { ssr: false });

function formatRp(n: number): string {
  return new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", minimumFractionDigits: 0 }).format(n);
}

export default function PackagesPage() {
  const [packages, setPackages] = useState<BillingPackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", speedUp: "", speedDown: "", price: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { device, setDevice } = useBillingDevice();

  const load = () => BillingAPI.getPackages(device).then(setPackages).catch(() => {});
  useEffect(() => { if (!device) return; load().finally(() => setLoading(false)); }, [device]);

  const openAdd = () => { setEditId(null); setForm({ name: "", speedUp: "", speedDown: "", price: "", description: "" }); setError(""); setShowForm(true); };
  const openEdit = (pkg: BillingPackage) => { setEditId(pkg.id); setForm({ name: pkg.name, speedUp: pkg.speedUp, speedDown: pkg.speedDown, price: String(pkg.price), description: pkg.description }); setError(""); setShowForm(true); };

  const handleSave = async () => {
    if (!form.name || !form.price) { setError("Nama dan harga wajib diisi"); return; }
    setSaving(true);
    setError("");
    try {
      if (editId) {
        await BillingAPI.updatePackage(editId, { name: form.name, speedUp: form.speedUp, speedDown: form.speedDown, price: Number(form.price), description: form.description, deviceId: device });
      } else {
        await BillingAPI.createPackage({ name: form.name, speedUp: form.speedUp, speedDown: form.speedDown, price: Number(form.price), description: form.description, deviceId: device });
      }
      setShowForm(false);
      load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Hapus paket "${name}"?`)) return;
    try { await BillingAPI.deletePackage(id); load(); } catch {}
  };

  return (
    <div className="p-5 sm:p-8 space-y-6 max-w-[1000px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/billing" className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-[var(--bg-hover)] transition-colors">
            <ArrowLeft className="w-5 h-5 text-[var(--text-secondary)]" />
          </Link>
          <div>
            <h1 className="text-[22px] font-bold text-[var(--text-primary)] tracking-[-0.025em]">Paket</h1>
            <p className="text-[13px] text-[var(--text-tertiary)]">Kelola paket langganan</p>
          </div>
          <DeviceSelector value={device} onChange={setDevice} />
        </div>
        <button onClick={openAdd} className="btn btn-primary text-[13px]">
          <Plus className="w-4 h-4" /> Tambah Paket
        </button>
      </div>

      <BillingNav current="/billing/packages" />

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-[480px] p-6 !rounded-2xl shadow-[var(--shadow-xl)] anim-scale" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-bold text-[var(--text-primary)]">{editId ? "Edit Paket" : "Tambah Paket"}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]">
                <X className="w-4 h-4 text-[var(--text-tertiary)]" />
              </button>
            </div>

            {error && (
              <div className="mb-4 p-3 rounded-xl bg-[var(--red-soft)] text-[13px] text-[var(--red)] font-medium">{error}</div>
            )}

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Nama Paket</label>
                <input type="text" placeholder="Contoh: 10 Mbps" value={form.name} onChange={e => setForm({...form, name: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Download</label>
                  <input type="text" placeholder="10 Mbps" value={form.speedDown} onChange={e => setForm({...form, speedDown: e.target.value})} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Upload</label>
                  <input type="text" placeholder="5 Mbps" value={form.speedUp} onChange={e => setForm({...form, speedUp: e.target.value})} />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Harga / Bulan (Rp)</label>
                <input type="number" placeholder="150000" value={form.price} onChange={e => setForm({...form, price: e.target.value})} />
              </div>
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Keterangan</label>
                <input type="text" placeholder="Opsional" value={form.description} onChange={e => setForm({...form, description: e.target.value})} />
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

      {/* List */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-20 rounded-2xl" />)}</div>
      ) : packages.length === 0 ? (
        <div className="card p-10 text-center">
          <Package className="w-12 h-12 text-[var(--text-quaternary)] mx-auto mb-3" />
          <p className="text-[15px] font-semibold text-[var(--text-secondary)]">Belum ada paket</p>
          <p className="text-[13px] text-[var(--text-tertiary)] mt-1">Tambahkan paket langganan pertama</p>
          <button onClick={openAdd} className="btn btn-primary mt-4 text-[13px]"><Plus className="w-4 h-4" /> Tambah Paket</button>
        </div>
      ) : (
        <div className="space-y-3">
          {packages.map(pkg => (
            <div key={pkg.id} className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-10 h-10 rounded-[12px] bg-[var(--purple-soft)] flex items-center justify-center flex-shrink-0">
                <Wifi className="w-5 h-5 text-[var(--purple)]" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">{pkg.name}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                  {pkg.speedDown && <span className="text-[12px] text-[var(--text-tertiary)]">↓ {pkg.speedDown}</span>}
                  {pkg.speedUp && <span className="text-[12px] text-[var(--text-tertiary)]">↑ {pkg.speedUp}</span>}
                  {pkg.description && <span className="text-[12px] text-[var(--text-tertiary)]">{pkg.description}</span>}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-[17px] font-bold text-[var(--blue)] tabular-nums">{formatRp(pkg.price)}</span>
                <span className="text-[11px] text-[var(--text-quaternary)]">/bulan</span>
              </div>
              <div className="flex gap-1.5">
                <button onClick={() => openEdit(pkg)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--blue)]">
                  <Edit3 className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(pkg.id, pkg.name)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--red-soft)] text-[var(--text-tertiary)] hover:text-[var(--red)]">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
