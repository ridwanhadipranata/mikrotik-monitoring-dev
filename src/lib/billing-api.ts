import { authFetch } from "./auth";
import type {
  BillingPackage,
  BillingCustomer,
  BillingInvoice,
  BillingSummary,
  BillingQueue,
  BillingDeviceInfo,
} from "./billing-types";

function getBase(): string {
  if (typeof window === "undefined") return "";
  return window.location.pathname.startsWith("/monitoring") ? "/monitoring" : "";
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const base = getBase();
  const res = await authFetch(`${base}${path}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "Request failed" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

function withDevice(url: string, deviceId?: string): string {
  if (!deviceId) return url;
  const sep = url.includes("?") ? "&" : "?";
  return `${url}${sep}device=${deviceId}`;
}

// ── Devices (billing groups) ──────────────────────────────────
export const BillingAPI = {
  getDevices: () => apiFetch<BillingDeviceInfo[]>("/api/billing/devices"),

  // ── Packages ──────────────────────────────────────────────────
  getPackages: (deviceId?: string) =>
    apiFetch<BillingPackage[]>(withDevice("/api/billing/packages", deviceId)),

  createPackage: (data: Omit<BillingPackage, "id" | "createdAt">) =>
    apiFetch<BillingPackage>("/api/billing/packages", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updatePackage: (id: string, data: Partial<BillingPackage>) =>
    apiFetch<BillingPackage>(`/api/billing/packages/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deletePackage: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/billing/packages/${id}`, {
      method: "DELETE",
    }),

  // ── Customers ─────────────────────────────────────────────────
  getCustomers: (deviceId?: string) =>
    apiFetch<BillingCustomer[]>(withDevice("/api/billing/customers", deviceId)),

  createCustomer: (data: Omit<BillingCustomer, "id" | "createdAt">) =>
    apiFetch<BillingCustomer>("/api/billing/customers", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateCustomer: (id: string, data: Partial<BillingCustomer>) =>
    apiFetch<BillingCustomer>(`/api/billing/customers/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteCustomer: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/billing/customers/${id}`, {
      method: "DELETE",
    }),

  // ── Invoices ──────────────────────────────────────────────────
  getInvoices: (deviceId?: string) =>
    apiFetch<BillingInvoice[]>(withDevice("/api/billing/invoices", deviceId)),

  createInvoice: (data: Omit<BillingInvoice, "id" | "status" | "paidDate" | "createdAt" | "ppn" | "discount" | "totalAmount">) =>
    apiFetch<BillingInvoice>("/api/billing/invoices", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateInvoice: (id: string, data: Partial<BillingInvoice>) =>
    apiFetch<BillingInvoice>(`/api/billing/invoices/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    }),

  deleteInvoice: (id: string) =>
    apiFetch<{ success: boolean }>(`/api/billing/invoices/${id}`, {
      method: "DELETE",
    }),

  // ── Summary ───────────────────────────────────────────────────
  getSummary: (deviceId?: string) =>
    apiFetch<BillingSummary>(withDevice("/api/billing/summary", deviceId)),

  // ── Queues ────────────────────────────────────────────────────
  getQueues: (deviceId?: string) =>
    apiFetch<BillingQueue[]>(withDevice("/api/billing/queues", deviceId)),

  // ── Generate Invoices ─────────────────────────────────────────
  generateInvoices: (month: number, year: number, deviceId?: string) =>
    apiFetch<{ created: number; total: number }>("/api/billing/generate-invoices", {
      method: "POST",
      body: JSON.stringify({ month, year, deviceId }),
    }),
};
