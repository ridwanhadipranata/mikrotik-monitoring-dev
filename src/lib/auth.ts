"use client";

const TOKEN_KEY = "mikromon_token";
const USER_KEY = "mikromon_user";

export interface AuthUser {
  username: string;
  role: string;
  name: string;
}

export interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

// ── Token Storage ──────────────────────────────────────────────

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function getStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setStoredUser(user: AuthUser): void {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ── API Calls ──────────────────────────────────────────────────

function getApiBase(): string {
  if (typeof window === "undefined") return "";
  // Detect if we're under /monitoring prefix
  return window.location.pathname.startsWith("/monitoring") ? "/monitoring" : "";
}

export async function login(
  username: string,
  password: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> {
  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      return { success: false, error: data.error || "Login failed" };
    }

    setToken(data.token);
    setStoredUser(data.user);
    return { success: true, user: data.user };
  } catch (err) {
    return { success: false, error: "Network error. Please try again." };
  }
}

export async function verifyToken(): Promise<{
  valid: boolean;
  user?: AuthUser;
}> {
  const token = getToken();
  if (!token) return { valid: false };

  try {
    const base = getApiBase();
    const res = await fetch(`${base}/api/auth/verify`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      removeToken();
      return { valid: false };
    }

    const data = await res.json();
    if (data.user) setStoredUser(data.user);
    return { valid: true, user: data.user };
  } catch {
    return { valid: false };
  }
}

export async function logout(): Promise<void> {
  const token = getToken();
  try {
    const base = getApiBase();
    await fetch(`${base}/api/auth/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Ignore errors — clear local state anyway
  }
  removeToken();
}

// ── Authenticated Fetch Helper ─────────────────────────────────

export function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return fetch(url, { ...options, headers }).then(res => {
    if (res.status === 401) {
      removeToken();
      if (typeof window !== "undefined") window.location.href = "/monitoring/login";
    }
    return res;
  });
}

// ── Route Protection ───────────────────────────────────────────

export function isAuthenticated(): boolean {
  return !!getToken();
}
