"use client";

import { useState, useEffect } from "react";
import { Header } from "@/components/layout/Header";
import { authFetch } from "@/lib/auth";
import { cn } from "@/lib/utils";
import {
  Plus,
  Building2,
  Users,
  Server,
  CreditCard,
  Search,
  X,
  Loader2,
  AlertCircle,
  ChevronRight,
  Edit3,
  Trash2,
  Shield,
  Eye,
  EyeOff,
  UserPlus,
  Key,
  MoreHorizontal,
} from "lucide-react";

interface Tenant {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  _count: {
    users: number;
    routers: number;
    customers: number;
  };
}

interface TenantUser {
  id: string;
  username: string;
  role: string;
  displayName: string;
  createdAt: string;
}

export default function TenantsPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editTenant, setEditTenant] = useState<Tenant | null>(null);
  const [deleteTenant, setDeleteTenant] = useState<Tenant | null>(null);
  const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchTenants();
  }, []);

  async function fetchTenants() {
    try {
      const res = await authFetch("/monitoring/api/tenants");
      if (res.ok) {
        const data = await res.json();
        setTenants(data);
      } else if (res.status === 403) {
        setError("Only superadmin can access this page");
      }
    } catch (err) {
      console.error("Failed to fetch tenants:", err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Header title="Tenants" subtitle={`${tenants.length} organizations`} />

      <div className="p-4 md:p-6 space-y-4">
        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-[13px]">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Actions Bar */}
        <div className="flex items-center justify-between">
          <p className="text-[13px] text-[var(--text-tertiary)]">
            Manage organizations and their isolated environments
          </p>
          <button onClick={() => setShowModal(true)} className="btn btn-primary">
            <Plus className="w-4 h-4" />
            Add Tenant
          </button>
        </div>

        {/* Tenant Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-[var(--blue)]" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tenants.map((tenant, idx) => (
              <TenantCard
                key={tenant.id}
                tenant={tenant}
                index={idx}
                onManageUsers={() => setSelectedTenant(tenant)}
                onEdit={() => setEditTenant(tenant)}
                onDelete={() => setDeleteTenant(tenant)}
              />
            ))}
          </div>
        )}
      </div>

      {showModal && (
        <CreateTenantModal
          onClose={() => setShowModal(false)}
          onSave={() => { setShowModal(false); fetchTenants(); }}
        />
      )}

      {editTenant && (
        <EditTenantModal
          tenant={editTenant}
          onClose={() => setEditTenant(null)}
          onSave={() => { setEditTenant(null); fetchTenants(); }}
        />
      )}

      {deleteTenant && (
        <DeleteTenantModal
          tenant={deleteTenant}
          onClose={() => setDeleteTenant(null)}
          onConfirm={() => { setDeleteTenant(null); fetchTenants(); }}
        />
      )}

      {selectedTenant && (
        <TenantUsersModal
          tenant={selectedTenant}
          onClose={() => setSelectedTenant(null)}
        />
      )}
    </>
  );
}

function TenantCard({
  tenant,
  index,
  onManageUsers,
  onEdit,
  onDelete,
}: {
  tenant: Tenant;
  index: number;
  onManageUsers: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="card p-5 animate-fade-in" style={{ animationDelay: `${index * 0.05}s` }}>
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[var(--blue)]/10 text-[var(--blue)] flex items-center justify-center">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-[15px] font-semibold text-[var(--text-primary)]">
              {tenant.name}
            </h3>
            <p className="text-[12px] text-[var(--text-tertiary)] font-mono">
              {tenant.slug}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)] text-[var(--text-tertiary)] hover:text-[var(--blue)] transition-colors" title="Edit">
            <Edit3 className="w-4 h-4" />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-[#FF3B30]/10 text-[var(--text-tertiary)] hover:text-[#FF3B30] transition-colors" title="Hapus">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Description */}
      {tenant.description && (
        <p className="text-[13px] text-[var(--text-secondary)] mb-4 line-clamp-2">
          {tenant.description}
        </p>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <StatItem icon={Users} label="Users" value={tenant._count.users} />
        <StatItem icon={Server} label="Routers" value={tenant._count.routers} />
        <StatItem icon={CreditCard} label="Customers" value={tenant._count.customers} />
      </div>

      {/* Actions */}
      <button
        onClick={onManageUsers}
        className="btn btn-secondary w-full text-[13px] !py-2"
      >
        <Users className="w-3.5 h-3.5" />
        Manage Users
        <ChevronRight className="w-3.5 h-3.5 ml-auto" />
      </button>
    </div>
  );
}

function StatItem({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <div className="flex flex-col items-center p-2 rounded-lg bg-[var(--bg-base)]">
      <Icon className="w-4 h-4 text-[var(--text-tertiary)] mb-1" />
      <span className="text-[15px] font-semibold text-[var(--text-primary)]">{value}</span>
      <span className="text-[10px] text-[var(--text-tertiary)]">{label}</span>
    </div>
  );
}

function CreateTenantModal({ onClose, onSave }: { onClose: () => void; onSave: () => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminDisplayName, setAdminDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  function handleNameChange(value: string) {
    setName(value);
    if (!slug || slug === generateSlug(name)) {
      setSlug(generateSlug(value));
    }
  }

  function generateSlug(str: string): string {
    return str
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name || !slug || !adminUsername || !adminPassword) {
      setError("All fields are required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const res = await authFetch("/monitoring/api/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          slug,
          description,
          adminUsername,
          adminPassword,
          adminDisplayName: adminDisplayName || adminUsername,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to create tenant");
      }

      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-lg p-6 animate-scale-in !rounded-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">
              Add Tenant
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
              Create a new organization with its admin account
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-base)] transition-colors"
          >
            <X className="w-5 h-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Organization Section */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] space-y-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Organization
            </h3>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g. ISP Jatiroyo"
                required
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                Slug <span className="text-[var(--text-tertiary)]">(unique ID)</span>
              </label>
              <input
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="isp-jatiroyo"
                className="font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                Description <span className="text-[var(--text-tertiary)]">(optional)</span>
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description..."
                rows={2}
              />
            </div>
          </div>

          {/* Admin Account Section */}
          <div className="p-4 rounded-xl bg-[var(--bg-base)] space-y-3">
            <h3 className="text-[13px] font-semibold text-[var(--text-primary)] flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Admin Account
            </h3>

            <div>
              <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                Display Name
              </label>
              <input
                type="text"
                value={adminDisplayName}
                onChange={(e) => setAdminDisplayName(e.target.value)}
                placeholder="e.g. Admin Jatiroyo"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                  Username
                </label>
                <input
                  type="text"
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="admin"
                  required
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--text-secondary)] mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="••••••"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4 text-[var(--text-tertiary)]" />
                    ) : (
                      <Eye className="w-4 h-4 text-[var(--text-tertiary)]" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-[13px]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Building2 className="w-4 h-4" />
              )}
              {saving ? "Creating..." : "Create Tenant"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TenantUsersModal({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddUser, setShowAddUser] = useState(false);
  const [editUser, setEditUser] = useState<TenantUser | null>(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      const res = await authFetch(`/monitoring/api/tenants/${tenant.id}/users`);
      if (res.ok) setUsers(await res.json());
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteUser(userId: string, username: string) {
    if (!confirm(`Hapus user "${username}"?`)) return;
    try {
      const res = await authFetch(`/monitoring/api/tenants/${tenant.id}/users/${userId}`, { method: "DELETE" });
      if (res.ok) fetchUsers();
    } catch (err) {
      console.error("Failed to delete user:", err);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-lg p-6 animate-scale-in !rounded-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">
              {tenant.name}
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
              {users.length} user{users.length !== 1 ? "s" : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditUser(null); setShowAddUser(true); }}
              className="btn btn-primary text-[13px] !py-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Add User
            </button>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-base)] transition-colors"
            >
              <X className="w-5 h-5 text-[var(--text-tertiary)]" />
            </button>
          </div>
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="w-6 h-6 animate-spin text-[var(--blue)]" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-10">
            <Users className="w-10 h-10 text-[var(--text-tertiary)] mx-auto mb-2" />
            <p className="text-[14px] text-[var(--text-secondary)]">No users yet</p>
            <p className="text-[12px] text-[var(--text-tertiary)]">Add the first user for this tenant</p>
          </div>
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div key={user.id} className="card p-3 flex items-center gap-3">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-white text-[13px] font-bold",
                  user.role === "admin" ? "bg-[var(--blue)]" : "bg-[var(--green)]"
                )}>
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[14px] font-medium text-[var(--text-primary)]">
                      {user.displayName}
                    </span>
                    <span className={cn(
                      "badge text-[9px]",
                      user.role === "admin" ? "badge-blue" : "badge-green"
                    )}>
                      {user.role}
                    </span>
                  </div>
                  <p className="text-[12px] text-[var(--text-tertiary)] font-mono">@{user.username}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => { setEditUser(user); setShowAddUser(true); }}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--bg-base)] transition-colors"
                    title="Edit user"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                  </button>
                  <button
                    onClick={() => handleDeleteUser(user.id, user.username)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#FF3B30]/10 transition-colors"
                    title="Delete user"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-[#FF3B30]" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddUser && (
        <TenantUserModal
          tenantId={tenant.id}
          user={editUser}
          onClose={() => { setShowAddUser(false); setEditUser(null); }}
          onSave={() => { setShowAddUser(false); setEditUser(null); fetchUsers(); }}
        />
      )}
    </div>
  );
}

function TenantUserModal({
  tenantId,
  user,
  onClose,
  onSave,
}: {
  tenantId: string;
  user: TenantUser | null;
  onClose: () => void;
  onSave: () => void;
}) {
  const [username, setUsername] = useState(user?.username || "");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [role, setRole] = useState(user?.role || "staff");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEdit = !!user;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username || (!isEdit && !password)) {
      setError("Username and password are required");
      return;
    }

    setSaving(true);
    setError("");

    try {
      const body: any = { displayName: displayName || username, role };
      if (!isEdit) body.username = username;
      if (password) body.password = password;

      const url = isEdit
        ? `/monitoring/api/tenants/${tenantId}/users/${user.id}`
        : `/monitoring/api/tenants/${tenantId}/users`;
      const method = isEdit ? "PUT" : "POST";

      const res = await authFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save user");
      }

      onSave();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card w-full max-w-md p-6 animate-scale-in !rounded-2xl">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--text-primary)]">
              {isEdit ? "Edit User" : "Add User"}
            </h2>
            <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
              {isEdit ? "Update user credentials" : "Create a new user for this tenant"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-[var(--bg-base)] transition-colors">
            <X className="w-5 h-5 text-[var(--text-tertiary)]" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Display Name</label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Admin Jatiroyo"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Username</label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                disabled={isEdit}
                required
              />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">
                Password {isEdit && <span className="text-[var(--text-tertiary)]">(keep empty to keep current)</span>}
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isEdit ? "••••••" : "Enter password"}
                  required={!isEdit}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2">
                  {showPassword ? <EyeOff className="w-4 h-4 text-[var(--text-tertiary)]" /> : <Eye className="w-4 h-4 text-[var(--text-tertiary)]" />}
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { value: "admin", label: "Admin", desc: "Full access", color: "var(--blue)" },
                { value: "staff", label: "Staff", desc: "Read-only", color: "var(--green)" },
              ].map((r) => (
                <button
                  key={r.value}
                  type="button"
                  onClick={() => setRole(r.value)}
                  className={cn(
                    "p-3 rounded-xl border-2 text-left transition-all",
                    role === r.value
                      ? "border-[var(--blue)] bg-[var(--blue)]/5"
                      : "border-[var(--border)] hover:border-[var(--text-tertiary)]"
                  )}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[13px] font-semibold text-[var(--text-primary)]">{r.label}</span>
                    {role === r.value && <CheckCircle2 className="w-4 h-4 text-[var(--blue)]" />}
                  </div>
                  <p className="text-[11px] text-[var(--text-tertiary)]">{r.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-[13px]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              {saving ? "Saving..." : isEdit ? "Update User" : "Create User"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CheckCircle2({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function EditTenantModal({
  tenant,
  onClose,
  onSave,
}: {
  tenant: Tenant;
  onClose: () => void;
  onSave: () => void;
}) {
  const [name, setName] = useState(tenant.name);
  const [description, setDescription] = useState(tenant.description || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    try {
      const res = await authFetch(`/monitoring/api/tenants/${tenant.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null }),
      });
      if (res.ok) onSave();
      else {
        const data = await res.json();
        setError(data.error || "Gagal update tenant");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[var(--bg-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">Edit Tenant</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Nama Tenant</label>
            <input value={name} onChange={e => setName(e.target.value)} className="input" required />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Deskripsi</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} className="input" rows={3} />
          </div>
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-[13px]">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn btn-secondary flex-1">Batal</button>
            <button type="submit" disabled={saving} className="btn btn-primary flex-1">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DeleteTenantModal({
  tenant,
  onClose,
  onConfirm,
}: {
  tenant: Tenant;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      const res = await authFetch(`/monitoring/api/tenants/${tenant.id}`, { method: "DELETE" });
      if (res.ok) onConfirm();
      else {
        const data = await res.json();
        setError(data.error || "Gagal hapus tenant");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[var(--bg-primary)] rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[17px] font-semibold text-[var(--text-primary)]">Hapus Tenant</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--bg-secondary)]">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-[14px] text-[var(--text-secondary)] mb-4">
          Yakin ingin menonaktifkan tenant <strong>{tenant.name}</strong>? Semua user di tenant ini juga akan dinonaktifkan.
        </p>
        {tenant._count.routers > 0 && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF9500]/10 text-[#FF9500] text-[13px] mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            Tenant ini masih memiliki {tenant._count.routers} router aktif. Hapus router terlebih dahulu.
          </div>
        )}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-[#FF3B30]/10 text-[#FF3B30] text-[13px] mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
        <div className="flex gap-3">
          <button onClick={onClose} className="btn btn-secondary flex-1">Batal</button>
          <button
            onClick={handleDelete}
            disabled={deleting || tenant._count.routers > 0}
            className="btn flex-1 bg-[#FF3B30] text-white hover:bg-[#D63027] disabled:opacity-50"
          >
            {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
            {deleting ? "Menghapus..." : "Hapus"}
          </button>
        </div>
      </div>
    </div>
  );
}
