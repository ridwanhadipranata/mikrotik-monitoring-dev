"use client";

import { useState } from "react";
import { Header } from "@/components/layout/Header";
import { cn } from "@/lib/utils";
import Link from "next/link";
import {
  Settings, Monitor, Bell, Shield, Database, Save, RefreshCw,
  Globe, Users,
} from "lucide-react";

type Tab = "general" | "notifications" | "security" | "data";

const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "general", label: "General", icon: <Settings className="w-4 h-4" /> },
  { id: "notifications", label: "Notifications", icon: <Bell className="w-4 h-4" /> },
  { id: "security", label: "Security", icon: <Shield className="w-4 h-4" /> },
  { id: "data", label: "Data & Storage", icon: <Database className="w-4 h-4" /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("general");
  return (
    <>
      <Header title="Settings" subtitle="Configure your monitoring dashboard" />

      <div className="p-4 md:p-6">
        {/* Coming Soon Notice */}
        <div className="card p-4 bg-[var(--blue-soft)] border-[var(--blue)]/20 mb-6">
          <p className="text-[13px] text-[var(--blue)] font-medium">
            ⚙️ Pengaturan sistem sedang dalam pengembangan. Saat ini menampilkan demo.
          </p>
        </div>

        {/* User Management Card (Admin Only) */}
        <Link href="/settings/users" className="card p-5 flex items-center gap-4 mb-6 hover:bg-[var(--bg-hover)] transition-colors">
          <div className="w-12 h-12 rounded-[14px] bg-[var(--blue-soft)] flex items-center justify-center">
            <Users className="w-6 h-6 text-[var(--blue)]" />
          </div>
          <div className="flex-1">
            <h3 className="text-[15px] font-bold text-[var(--text-primary)]">Kelola User</h3>
            <p className="text-[13px] text-[var(--text-tertiary)]">Tambah, edit, dan hapus akun pengguna</p>
          </div>
          <div className="text-[var(--text-quaternary)]">→</div>
        </Link>

        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar Tabs */}
          <div className="md:w-[200px] flex flex-row md:flex-col gap-1 overflow-x-auto md:overflow-visible shrink-0">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "nav-link whitespace-nowrap",
                  activeTab === tab.id && "active"
                )}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {activeTab === "general" && (
              <div className="space-y-6 animate-fade-in">
                <Section title="Polling">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="System Poll Interval" placeholder="2000" suffix="ms" defaultValue="2000" />
                    <InputField label="Traffic Poll Interval" placeholder="1000" suffix="ms" defaultValue="1000" />
                    <InputField label="History Snapshot Interval" placeholder="60" suffix="sec" defaultValue="60" />
                    <InputField label="Connection Timeout" placeholder="5000" suffix="ms" defaultValue="5000" />
                  </div>
                </Section>

                <Section title="Display">
                  <div className="space-y-1">
                    <Toggle label="Show temperature (if available)" defaultChecked />
                    <Toggle label="Show per-core CPU" />
                    <Toggle label="Animate chart transitions" defaultChecked />
                    <Toggle label="Compact mode" />
                  </div>
                </Section>
              </div>
            )}

            {activeTab === "notifications" && (
              <div className="space-y-6 animate-fade-in">
                <Section title="Notification Channels">
                  <div className="space-y-3">
                    <ChannelCard
                      icon={<Globe className="w-5 h-5 text-[#0A84FF]" />}
                      iconBg="bg-[#0A84FF]/10"
                      name="Browser Notifications"
                      desc="Push notifications in browser"
                      defaultEnabled
                    />
                    <ChannelCard
                      icon={<Bell className="w-5 h-5 text-[#34C759]" />}
                      iconBg="bg-[#34C759]/10"
                      name="Telegram Bot"
                      desc="Send alerts to Telegram"
                    />
                    <ChannelCard
                      icon={<Monitor className="w-5 h-5 text-[#FF9500]" />}
                      iconBg="bg-[#FF9500]/10"
                      name="Email (SMTP)"
                      desc="Send email notifications"
                    />
                  </div>
                </Section>

                <Section title="Telegram Configuration">
                  <div className="grid grid-cols-1 gap-4">
                    <InputField label="Bot Token" placeholder="123456:ABC-DEF..." />
                    <InputField label="Chat ID" placeholder="-1001234567890" />
                  </div>
                </Section>
              </div>
            )}

            {activeTab === "security" && (
              <div className="space-y-6 animate-fade-in">
                <Section title="Authentication">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Current Password" type="password" placeholder="••••••" />
                    <div />
                    <InputField label="New Password" type="password" placeholder="••••••" />
                    <InputField label="Confirm Password" type="password" placeholder="••••••" />
                  </div>
                </Section>

                <Section title="API Security">
                  <div className="space-y-1">
                    <Toggle label="Require authentication for API access" defaultChecked />
                    <Toggle label="Encrypt stored credentials" defaultChecked />
                    <Toggle label="Allow CORS from any origin" />
                  </div>
                </Section>

                <Section title="Session">
                  <InputField label="Session Timeout" placeholder="3600" suffix="sec" defaultValue="3600" />
                </Section>
              </div>
            )}

            {activeTab === "data" && (
              <div className="space-y-6 animate-fade-in">
                <Section title="Data Retention">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <InputField label="Minute-level data" placeholder="7" suffix="days" defaultValue="7" />
                    <InputField label="Hourly aggregates" placeholder="30" suffix="days" defaultValue="30" />
                    <InputField label="Daily summaries" placeholder="365" suffix="days" defaultValue="365" />
                  </div>
                </Section>

                <Section title="Database">
                  <div className="card p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div>
                        <p className="text-[14px] font-medium text-[var(--text-primary)]">SQLite Database</p>
                        <p className="text-[12px] text-[var(--text-tertiary)]">./data/monitor.db</p>
                      </div>
                      <span className="text-[13px] font-mono text-[var(--text-secondary)]">12.4 MB</span>
                    </div>
                    <div className="flex gap-2">
                      <button className="btn btn-secondary text-[12px] !py-1.5">
                        <Database className="w-3.5 h-3.5" />
                        Backup Now
                      </button>
                      <button className="btn btn-secondary text-[12px] !py-1.5">
                        <RefreshCw className="w-3.5 h-3.5" />
                        Vacuum
                      </button>
                    </div>
                  </div>
                </Section>
              </div>
            )}

            {/* Save Button */}
            <div className="mt-8 pt-6 border-t border-[var(--border)] flex justify-end gap-3">
              <button className="btn btn-secondary">Cancel</button>
              <button className="btn btn-primary">
                <Save className="w-4 h-4" />
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[15px] font-semibold text-[var(--text-primary)] mb-3">{title}</h3>
      {children}
    </div>
  );
}

function InputField({ label, placeholder, suffix, defaultValue, type = "text" }: {
  label: string; placeholder?: string; suffix?: string; defaultValue?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={type}
          placeholder={placeholder}
          defaultValue={defaultValue}
          className={suffix ? "pr-12" : ""}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[12px] text-[var(--text-tertiary)] pointer-events-none">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}

function Toggle({ label, defaultChecked = false }: { label?: string; defaultChecked?: boolean }) {
  const [checked, setChecked] = useState(defaultChecked);
  return (
    <label className="flex items-center justify-between py-2 cursor-pointer group">
      {label && (
        <span className="text-[14px] text-[var(--text-primary)] group-hover:text-[var(--blue)] transition-colors">
          {label}
        </span>
      )}
      <button
        type="button"
        onClick={() => setChecked(!checked)}
        className={cn(
          "w-11 h-6 rounded-full transition-all relative",
          checked ? "bg-[#34C759]" : "bg-[var(--bg-input)]"
        )}
      >
        <span className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
          checked && "translate-x-5"
        )} />
      </button>
    </label>
  );
}

function ChannelCard({ icon, iconBg, name, desc, defaultEnabled = false }: {
  icon: React.ReactNode; iconBg: string; name: string; desc: string; defaultEnabled?: boolean;
}) {
  const [enabled, setEnabled] = useState(defaultEnabled);
  return (
    <div className="card p-4 flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>{icon}</div>
      <div className="flex-1">
        <p className="text-[14px] font-medium text-[var(--text-primary)]">{name}</p>
        <p className="text-[12px] text-[var(--text-tertiary)]">{desc}</p>
      </div>
      <button
        onClick={() => setEnabled(!enabled)}
        className={cn(
          "w-11 h-6 rounded-full transition-all relative",
          enabled ? "bg-[#34C759]" : "bg-[var(--bg-input)]"
        )}
      >
        <span className={cn(
          "absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform",
          enabled && "translate-x-5"
        )} />
      </button>
    </div>
  );
}
