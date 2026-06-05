"use client";

import { useState, useEffect } from "react";
import {
  Eye,
  EyeOff,
  ArrowRight,
  Sun,
  Moon,
  Monitor,
  Lock,
  User,
  AlertCircle,
  Shield,
} from "lucide-react";
import Image from "next/image";
import { login, isAuthenticated } from "@/lib/auth";

type Theme = "light" | "dark" | "system";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
}

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState("");
  const [shakeError, setShakeError] = useState(false);
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("theme") as Theme | null;
    if (saved) { setTheme(saved); applyTheme(saved); }
    else applyTheme("system");
    if (isAuthenticated()) {
      const params = new URLSearchParams(window.location.search);
      const returnUrl = params.get("return") || "/monitoring";
      window.location.href = returnUrl;
    }
  }, []);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => applyTheme("system");
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  const cycleTheme = () => {
    const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    applyTheme(next);
  };

  const themeIcon =
    theme === "light" ? <Sun className="w-[15px] h-[15px]" /> :
    theme === "dark" ? <Moon className="w-[15px] h-[15px]" /> :
    <Monitor className="w-[15px] h-[15px]" />;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    setError("");
    const result = await login(username, password);
    if (result.success) {
      window.location.href = "/monitoring";
    } else {
      setError(result.error || "Login failed");
      setShakeError(true);
      setTimeout(() => setShakeError(false), 600);
      setLoading(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-[100dvh] flex flex-col relative overflow-hidden">
      {/* ── Animated Background ── */}
      <div className="fixed inset-0 bg-[var(--bg-base)]" />
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute top-[-30%] right-[-15%] w-[900px] h-[900px] rounded-full opacity-[0.07] dark:opacity-[0.1] login-orb-1"
          style={{ background: "radial-gradient(circle, #007AFF 0%, transparent 70%)" }}
        />
        <div
          className="absolute bottom-[-25%] left-[-10%] w-[700px] h-[700px] rounded-full opacity-[0.06] dark:opacity-[0.08] login-orb-2"
          style={{ background: "radial-gradient(circle, #5856D6 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-[30%] left-[60%] w-[500px] h-[500px] rounded-full opacity-[0.04] dark:opacity-[0.06] login-orb-3"
          style={{ background: "radial-gradient(circle, #AF52DE 0%, transparent 70%)" }}
        />
        <div
          className="absolute top-[60%] left-[20%] w-[300px] h-[300px] rounded-full opacity-[0.03] dark:opacity-[0.05] login-orb-4"
          style={{ background: "radial-gradient(circle, #34C759 0%, transparent 70%)" }}
        />
      </div>

      {/* ── Theme Toggle ── */}
      <div className="absolute top-5 right-5 z-20">
        <button
          onClick={cycleTheme}
          className="w-9 h-9 rounded-full flex items-center justify-center
                     bg-[var(--bg-card)]/80 backdrop-blur-xl border border-[var(--border)]
                     text-[var(--text-tertiary)] hover:text-[var(--text-primary)]
                     hover:bg-[var(--bg-card)] transition-all duration-300
                     shadow-[var(--shadow-sm)] active:scale-90"
          title={`Theme: ${theme}`}
        >
          {themeIcon}
        </button>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 flex items-center justify-center p-5 sm:p-8 relative z-10">
        <div className="w-full max-w-[420px]">
          {/* ── Logo ── */}
          <div className="text-center mb-10 login-card-anim">
            <div className="relative inline-block mb-4">
              {/* Neon glow layers */}
              <div className="absolute inset-[-20px] rounded-[32px] neon-glow-blue" />
              <div className="absolute inset-[-14px] rounded-[28px] neon-glow-orange" />
              <div className="absolute inset-[-8px] rounded-[24px] neon-glow-core" />
              {/* Logo */}
              <div className="relative w-[140px] h-[140px] sm:w-[160px] sm:h-[160px] mx-auto logo-float">
                <img
                  src="/monitoring/logo.png"
                  alt="Amanna Logo"
                  width={160}
                  height={160}
                  className="w-full h-full object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.15)]"
                />
              </div>
            </div>
            <p className="text-[15px] sm:text-[16px] text-[var(--text-tertiary)] mt-2 tracking-[-0.01em] font-medium">
              Mikrotik Network Monitor
            </p>
          </div>

          {/* ── Login Card ── */}
          <div
            className={`card !rounded-[20px] p-7 sm:p-8
                        bg-[var(--bg-card)]/80 backdrop-blur-2xl
                        border border-[var(--border)]
                        shadow-[var(--shadow-xl)]
                        ${shakeError ? "login-shake" : "login-card-anim-delay"}`}
          >
            <form onSubmit={handleLogin} className="space-y-5">
              {/* Error */}
              {error && (
                <div className="flex items-start gap-3 p-3.5 rounded-[14px] bg-[var(--red-soft)] border border-[var(--red)]/15">
                  <AlertCircle className="w-[18px] h-[18px] text-[var(--red)] flex-shrink-0 mt-0.5" />
                  <p className="text-[13px] text-[var(--red)] font-medium leading-relaxed">{error}</p>
                </div>
              )}

              {/* Username */}
              <div className="space-y-2">
                <label className="block text-[14px] font-semibold text-[var(--text-secondary)] pl-0.5 tracking-[-0.01em]">
                  Username
                </label>
                <div className="relative input-glow rounded-[14px] transition-shadow duration-300">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)] pointer-events-none">
                    <User className="w-[18px] h-[18px]" />
                  </div>
                  <input
                    type="text"
                    placeholder="Enter username"
                    value={username}
                    onChange={(e) => { setUsername(e.target.value); setError(""); }}
                    autoComplete="username"
                    autoFocus
                    className="!pl-11 !pr-4 !py-4 !text-[16px] !rounded-[14px]
                               bg-[var(--bg-input)] border border-[var(--border)]
                               text-[var(--text-primary)] font-medium
                               placeholder:text-[var(--text-quaternary)] placeholder:font-normal
                               focus:border-[var(--blue)]/50
                               transition-all duration-300"
                  />
                </div>
              </div>

              {/* Password */}
              <div className="space-y-2">
                <label className="block text-[14px] font-semibold text-[var(--text-secondary)] pl-0.5 tracking-[-0.01em]">
                  Password
                </label>
                <div className="relative input-glow rounded-[14px] transition-shadow duration-300">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-quaternary)] pointer-events-none">
                    <Lock className="w-[18px] h-[18px]" />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(""); }}
                    autoComplete="current-password"
                    className="!pl-11 !pr-12 !py-4 !text-[16px] !rounded-[14px]
                               bg-[var(--bg-input)] border border-[var(--border)]
                               text-[var(--text-primary)] font-medium
                               placeholder:text-[var(--text-quaternary)] placeholder:font-normal
                               focus:border-[var(--blue)]/50
                               transition-all duration-300"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2
                               text-[var(--text-quaternary)] hover:text-[var(--text-secondary)]
                               transition-colors duration-200 p-1 rounded-lg hover:bg-[var(--bg-hover)]"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-[18px] h-[18px]" /> : <Eye className="w-[18px] h-[18px]" />}
                  </button>
                </div>
              </div>

              {/* Remember & Forgot */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2.5 cursor-pointer select-none group">
                  <div className="relative">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="peer sr-only"
                    />
                    <div className="w-[18px] h-[18px] rounded-[6px] border border-[var(--border)]
                                    bg-[var(--bg-input)] transition-all duration-200
                                    peer-checked:bg-[var(--blue)] peer-checked:border-[var(--blue)]
                                    peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--blue)]/30
                                    flex items-center justify-center">
                      {rememberMe && (
                        <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M2 6l3 3 5-5" />
                        </svg>
                      )}
                    </div>
                  </div>
                  <span className="text-[13px] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] transition-colors font-medium">
                    Remember me
                  </span>
                </label>
                <a href="#" className="text-[13px] text-[var(--blue)] hover:opacity-70 transition-opacity font-semibold">
                  Forgot password?
                </a>
              </div>

              {/* ── Login Button ── */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !username || !password}
                  className="btn-login w-full flex items-center justify-center gap-3
                             py-5 sm:py-[18px] rounded-[16px] text-[17px] sm:text-[16px] font-bold tracking-[-0.01em]
                             text-white relative z-10 min-h-[54px] sm:min-h-[50px]"
                >
                  {loading ? (
                    <div className="flex items-center gap-3">
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Signing in...</span>
                    </div>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* ── Security Badge ── */}
          <div className="login-footer-anim flex items-center justify-center gap-2 mt-7">
            <Shield className="w-3.5 h-3.5 text-[var(--text-quaternary)]" />
            <span className="text-[12px] text-[var(--text-quaternary)] font-medium tracking-[-0.01em]">
              Encrypted & Secure
            </span>
          </div>

          {/* ── Footer ── */}
          <div className="text-center mt-5 login-footer-anim">
            <p className="text-[11px] text-[var(--text-quaternary)]/60 tracking-[-0.01em]">
              Amanna v1.0 · Mikrotik Network Monitor
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
