"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { authFetch } from "@/lib/auth";
import { getStoredUser } from "@/lib/auth";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Edit3, Trash2, X, Save, Shield,
  Eye, EyeOff, AlertCircle, CheckCircle2,
} from "lucide-react";

interface User {
  username: string;
  role: string;
  displayName: string;
  createdAt: string;
}

const ROLES = [
  { value: "admin", label: "Administrator", color: "var(--blue)", desc: "Akses penuh ke semua fitur" },
  { value: "teknisi", label: "Teknisi", color: "var(--orange)", desc: "Dashboard, Status Client, WAN Traffic, Alerts, Settings" },
  { value: "admin_pembayaran", label: "Admin Pembayaran", color: "var(--green)", desc: "Akses ke Billing saja" },
];

function getApiBase() {
  if (typeof window === "undefined") return "";
  return window.location.pathname.startsWith("/monitoring") ? "/monitoring" : "";
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [form, setForm] = useState({ username: "", password: "", role: "teknisi", displayName: "" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const currentUser = getStoredUser();

  // Only admin can access
  useEffect(() => {
    if (currentUser?.role !== "admin") {
      router.replace("/settings");
    }
  }, []);

  const load = async () => {
    try {
      const res = await authFetch(`${getApiBase()}/api/users`);
      if (res.ok) setUsers(await res.json());
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openAdd = () => {
    setEditUser(null);
    setForm({ username: "", password: "", role: "teknisi", displayName: "" });
    setError(""); setSuccess("");
    setShowForm(true);
    setShowPassword(false);
  };

  const openEdit = (u: User) => {
    setEditUser(u);
    setForm({ username: u.username, password: "", role: u.role, displayName: u.displayName });
    setError(""); setSuccess("");
    setShowForm(true);
    setShowPassword(false);
  };

  const handleSave = async () => {
    if (!form.username || (!editUser && !form.password)) {
      setError("Username dan password wajib diisi");
      return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const base = getApiBase();
      const body: any = { role: form.role, displayName: form.displayName || form.username };
      if (form.password) body.password = form.password;

      const res = editUser
        ? await authFetch(`${base}/api/users/${editUser.username}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await authFetch(`${base}/api/users`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, username: form.username }) });

      const data = await res.json();
      if (!res.ok) { setError(data.error); setSaving(false); return; }

      setSuccess(editUser ? "User berhasil diupdate!" : "User berhasil ditambahkan!");
      setShowForm(false);
      load();
    } catch (e: any) { setError(e.message); }
    setSaving(false);
  };

  const handleDelete = async (u: User) => {
    if (!confirm(`Hapus user "${u.displayName}" (${u.username})?`)) return;
    try {
      const res = await authFetch(`${getApiBase()}/api/users/${u.username}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) { alert(data.error); return; }
      load();
    } catch {}
  };

  const getRoleInfo = (role: string) => ROLES.find(r => r.value === role) || ROLES[0];

  return (
    <>
      <Header title="Kelola User" subtitle="Manajemen akun dan akses pengguna" />
      <div className="p-4 md:p-6 space-y-5 max-w-[900px]">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-[var(--blue)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Daftar User</h2>
            <span className="badge badge-blue text-[10px]">{users.length} user</span>
          </div>
          <button onClick={openAdd} className="btn btn-primary text-[13px]">
            <Plus className="w-4 h-4" /> Tambah User
          </button>
        </div>

        {/* Success/Error */}
        {success && <div className="p-3 rounded-xl bg-[var(--green-soft)] text-[13px] text-[var(--green)] font-medium flex items-center gap-2"><CheckCircle2 className="w-4 h-4" />{success}</div>}

        {/* User List */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
        ) : (
          <div className="space-y-2">
            {users.map(u => {
              const roleInfo = getRoleInfo(u.role);
              const isCurrentUser = u.username === currentUser?.username;
              return (
                <div key={u.username} className="card p-4 flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-[14px] font-bold" style={{ background: roleInfo.color }}>
                    {u.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[14px] font-semibold text-[var(--text-primary)]">{u.displayName}</span>
                      {isCurrentUser && <span className="badge badge-blue text-[9px]">Anda</span>}
                    </div>
                    <p className="text-[12px] text-[var(--text-tertiary)]">@{u.username}</p>
                  </div>
                  <div className="text-right">
                    <span className="badge text-[10px]" style={{ background: `${roleInfo.color}15`, color: roleInfo.color, border: `1px solid ${roleInfo.color}30` }}>
                      {roleInfo.label}
                    </span>
                  </div>
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(u)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)] text-[var(--text-tertiary)] hover:text-[var(--blue)]">
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    {!isCurrentUser && (
                      <button onClick={() => handleDelete(u)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--red-soft)] text-[var(--text-tertiary)] hover:text-[var(--red)]">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm" onClick={() => setShowForm(false)}>
          <div className="card w-full max-w-[440px] p-6 !rounded-2xl shadow-[var(--shadow-xl)] anim-scale" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-[17px] font-bold text-[var(--text-primary)]">{editUser ? "Edit User" : "Tambah User"}</h2>
              <button onClick={() => setShowForm(false)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-hover)]"><X className="w-4 h-4 text-[var(--text-tertiary)]" /></button>
            </div>

            {error && <div className="mb-4 p-3 rounded-xl bg-[var(--red-soft)] text-[13px] text-[var(--red)] font-medium flex items-center gap-2"><AlertCircle className="w-4 h-4" />{error}</div>}

            <div className="space-y-4">
              {/* Username */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Username</label>
                <input
                  type="text" placeholder="username"
                  value={form.username} onChange={e => setForm({...form, username: e.target.value})}
                  disabled={!!editUser}
                  className={editUser ? "opacity-50 cursor-not-allowed" : ""}
                />
              </div>

              {/* Display Name */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Nama Tampilan</label>
                <input type="text" placeholder="Nama lengkap" value={form.displayName} onChange={e => setForm({...form, displayName: e.target.value})} />
              </div>

              {/* Password */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">
                  Password {editUser && <span className="text-[var(--text-quaternary)] font-normal">(kosongkan jika tidak diubah)</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder={editUser ? "••••••••" : "Password"}
                    value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                    className="!pr-10"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]">
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Role */}
              <div className="space-y-1.5">
                <label className="text-[13px] font-semibold text-[var(--text-secondary)]">Role</label>
                <div className="space-y-2">
                  {ROLES.map(r => (
                    <label key={r.value} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                      form.role === r.value ? "border-[var(--blue)] bg-[var(--blue-soft)]" : "border-[var(--border)] hover:border-[var(--blue)]/30"
                    }`}>
                      <input type="radio" name="role" value={r.value} checked={form.role === r.value} onChange={e => setForm({...form, role: e.target.value})} className="mt-0.5" />
                      <div>
                        <p className="text-[13px] font-semibold text-[var(--text-primary)]">{r.label}</p>
                        <p className="text-[11px] text-[var(--text-tertiary)] mt-0.5">{r.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => setShowForm(false)} className="btn btn-secondary flex-1 text-[13px]">Batal</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1 text-[13px]">
                {saving ? "Menyimpan..." : <><Save className="w-4 h-4" /> {editUser ? "Update" : "Simpan"}</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
